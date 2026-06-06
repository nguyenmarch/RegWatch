import json
import os
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.db import get_db

from app.models.remediation_doc import ActionPlan, ActionPlanTask, RemediationDoc
from app.schemas.remediation_doc import (
    ActionPlanResponse,
    ApprovalRequest,
    DocumentGenerateRequest,
    GroupDocumentGenerateRequest,
    RemediationDocResponse,
    RemediationDocUpdate,
)
from app.services.llm_generation import (
    get_old_document_from_qdrant,
    generate_remediation_html,
    get_old_document_from_qdrant_group,
    generate_remediation_html_group,
)

# ĐÃ ĐỔI PREFIX VÀ TAG Ở ĐÂY
router = APIRouter(prefix="/remediation", tags=["Remediation"])


@router.get("/action-plans", response_model=List[ActionPlanResponse])
async def list_action_plans(db: AsyncSession = Depends(get_db)):
    """
    [Mục đích]: Lấy danh sách Action Plan kèm Tasks từ Qdrant đồng bộ sang MySQL.
    
    [LƯU Ý MERGE CHO FRONTEND]: Dữ liệu trả về từ API này chứa các Tasks. 
    Frontend cần đọc trường `impacted_internal_doc` và `output_type` của từng Task. 
    Nếu nhiều Task có CÙNG `impacted_internal_doc`, FE phải gom ID của chúng lại 
    để ném vào API `/generate-group` (Sinh văn bản gộp) bên dưới.
    """
    from app.core.qdrant_client import qdrant_client
    from app.core.enums import KbType
    
    try:
        res, _ = qdrant_client.scroll(collection_name=KbType.ACTION_PLAN.collection_name, limit=100)
        for hit in res:
            try:
                data = json.loads(hit.payload['text'])
                if "action_plan_id" not in data:
                    continue
                    
                existing = await db.execute(select(ActionPlan).where(ActionPlan.plan_code == data["action_plan_id"]))
                if not existing.scalars().first():
                    ap = ActionPlan(
                        plan_code=data["action_plan_id"],
                        law_id=data["associated_law"]["law_id"],
                        law_title=data["associated_law"]["law_title"],
                        status=data["metadata"]["status"],
                        created_by=data["metadata"]["created_by"]
                    )
                    db.add(ap)
                    await db.flush()
                    
                    for t in data["tasks"]:
                        task = ActionPlanTask(
                            action_plan_id=ap.id,
                            task_code=t["task_id"],
                            task_name=t["task_name"],
                            target_department=t["target_department"],
                            action_required=t["action_required"],
                            impacted_internal_doc=t.get("impacted_internal_doc"),
                            output_type=t["output_type"]
                        )
                        db.add(task)
                    await db.commit()
            except Exception as e:
                pass 
    except Exception as e:
        pass 
        
    result = await db.execute(
        select(ActionPlan).options(
            selectinload(ActionPlan.tasks).selectinload(ActionPlanTask.document)
        )
    )
    action_plans = result.scalars().all()
            
    return action_plans


@router.delete("/action-plans/{plan_id}")
async def delete_action_plan(plan_id: int, db: AsyncSession = Depends(get_db)):
    """Xóa Action Plan và các Document liên quan"""
    result = await db.execute(select(ActionPlan).where(ActionPlan.id == plan_id))
    ap = result.scalars().first()
    if not ap:
        raise HTTPException(status_code=404, detail="Action Plan không tồn tại")
    
    await db.delete(ap)
    await db.commit()
    return {"message": "Đã xóa Action Plan"}


@router.post("/generate", response_model=RemediationDocResponse)
async def generate_document(
    req: DocumentGenerateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    [Mục đích]: Gọi LLM sinh văn bản đơn lẻ cho 1 Task cụ thể (Không Merge).
    Dành cho các Task đứng độc lập, không đụng chạm chung file quy chế với Task khác.
    """
    result = await db.execute(select(ActionPlanTask).where(ActionPlanTask.id == req.task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task không tồn tại")

    result_doc = await db.execute(
        select(RemediationDoc).where(RemediationDoc.task_id == req.task_id)
    )
    existing_doc = result_doc.scalars().first()

    try:
        content_dict = json.loads(existing_doc.content) if existing_doc and existing_doc.content else {}
    except Exception:
        content_dict = {}

    if req.generation_type == "document":
        old_doc = await get_old_document_from_qdrant(task)
        content_dict["old_document"] = old_doc
        modified_doc = await generate_remediation_html(task, "document", old_doc, req.refinement_prompt)
        content_dict["modified_document"] = modified_doc
    else:
        announcement = await generate_remediation_html(task, "announcement", "", req.refinement_prompt)
        content_dict["announcement"] = announcement

    new_content_str = json.dumps(content_dict, ensure_ascii=False)

    if existing_doc:
        existing_doc.content = new_content_str
        existing_doc.status = "DRAFT"
        existing_doc.product_approved = False
        existing_doc.cd_approved = False
        await db.commit()
        await db.refresh(existing_doc)
        return existing_doc
    else:
        new_doc = RemediationDoc(
            task_id=req.task_id,
            content=new_content_str,
            status="DRAFT"
        )
        db.add(new_doc)
        await db.commit()
        await db.refresh(new_doc)
        return new_doc


@router.post("/generate-group", response_model=List[RemediationDocResponse])
async def generate_document_group(
    req: GroupDocumentGenerateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    [Mục đích]: Gọi LLM sinh văn bản GỘP (Merge) dựa trên danh sách Task IDs.
    
    [LOGIC MERGE]: Đầu vào (req.task_ids) là một mảng các task có CÙNG `impacted_internal_doc` 
    hoặc CÙNG `output_type`. Backend sẽ gộp các task này lại thành 1 Prompt tổng hợp đẩy cho LLM. 
    Bản Draft sinh ra sẽ giải quyết đồng thời mọi xung đột, sau đó lưu kết quả dùng chung này 
    vào từng `RemediationDoc` của các Task tương ứng.
    """
    if not req.task_ids:
        raise HTTPException(status_code=400, detail="Danh sách Task ID trống")

    result = await db.execute(select(ActionPlanTask).where(ActionPlanTask.id.in_(req.task_ids)))
    tasks = result.scalars().all()
    if len(tasks) != len(req.task_ids):
        raise HTTPException(status_code=404, detail="Một hoặc nhiều Task không tồn tại")

    if req.generation_type == "document":
        old_doc = await get_old_document_from_qdrant_group(tasks)
        modified_doc = await generate_remediation_html_group(tasks, "document", old_doc, req.refinement_prompt)
    else:
        old_doc = ""
        modified_doc = ""
        
    announcement = ""
    if req.generation_type == "announcement":
        announcement = await generate_remediation_html_group(tasks, "announcement", "", req.refinement_prompt)

    generated_docs = []
    for task in tasks:
        result_doc = await db.execute(
            select(RemediationDoc).where(RemediationDoc.task_id == task.id)
        )
        existing_doc = result_doc.scalars().first()

        try:
            content_dict = json.loads(existing_doc.content) if existing_doc and existing_doc.content else {}
        except Exception:
            content_dict = {}

        if req.generation_type == "document":
            content_dict["old_document"] = old_doc
            try:
                gen_data = json.loads(modified_doc)
                content_dict["modified_document"] = gen_data.get("modified_document_html", modified_doc)
                content_dict["comments"] = gen_data.get("comments", [])
            except Exception:
                content_dict["modified_document"] = modified_doc
                content_dict["comments"] = []
        else:
            content_dict["announcement"] = announcement

        new_content_str = json.dumps(content_dict, ensure_ascii=False)

        if existing_doc:
            existing_doc.content = new_content_str
            existing_doc.status = "DRAFT"
            existing_doc.product_approved = False
            existing_doc.cd_approved = False
            db.add(existing_doc)
            doc_to_append = existing_doc
        else:
            new_doc = RemediationDoc(
                task_id=task.id,
                content=new_content_str,
                status="DRAFT"
            )
            db.add(new_doc)
            doc_to_append = new_doc
        
        generated_docs.append(doc_to_append)

    await db.commit()
    for d in generated_docs:
        await db.refresh(d)

    return generated_docs


@router.put("/documents/{doc_id}", response_model=RemediationDocResponse)
async def update_document(
    doc_id: int,
    req: RemediationDocUpdate,
    db: AsyncSession = Depends(get_db)
):
    """User chỉnh sửa tay văn bản (qua giao diện edit trực tiếp)"""
    result = await db.execute(select(RemediationDoc).where(RemediationDoc.id == doc_id))
    doc = result.scalars().first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy văn bản")
        
    doc.content = req.content
    doc.status = "PENDING"
    doc.product_approved = False
    doc.cd_approved = False
    
    await db.commit()
    await db.refresh(doc)
    return doc


@router.post("/documents/{doc_id}/approve", response_model=RemediationDocResponse)
async def approve_document(
    doc_id: int,
    req: ApprovalRequest,
    db: AsyncSession = Depends(get_db)
):
    """Cơ chế duyệt kép (Dual-Approval) cho Khối Sản phẩm hoặc Khối Tuân thủ"""
    result = await db.execute(select(RemediationDoc).where(RemediationDoc.id == doc_id))
    doc = result.scalars().first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy văn bản")
        
    if req.role.lower() == "product":
        doc.product_approved = True
    elif req.role.lower() == "cd":
        doc.cd_approved = True
    else:
        raise HTTPException(status_code=400, detail="Role không hợp lệ. Vui lòng gửi 'product' hoặc 'cd'")
        
    if doc.product_approved and doc.cd_approved:
        doc.status = "APPROVED"
    else:
        doc.status = "PENDING"
        
    await db.commit()
    await db.refresh(doc)
    return doc

@router.post("/upload-action-plan")
async def upload_action_plan(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Người dùng upload trực tiếp file action-plan.json (Dùng cho Demo/Test nhanh luồng Remediation)"""
    try:
        content = await file.read()
        data = json.loads(content)
        
        existing = await db.execute(select(ActionPlan).where(ActionPlan.plan_code == data["action_plan_id"]))
        if existing.scalars().first():
            return {"message": "Action Plan đã tồn tại"}
            
        ap = ActionPlan(
            plan_code=data["action_plan_id"],
            law_id=data["associated_law"]["law_id"],
            law_title=data["associated_law"]["law_title"],
            status=data["metadata"]["status"],
            created_by=data["metadata"]["created_by"]
        )
        db.add(ap)
        await db.flush()
        
        for t in data["tasks"]:
            task = ActionPlanTask(
                action_plan_id=ap.id,
                task_code=t["task_id"],
                task_name=t["task_name"],
                target_department=t["target_department"],
                action_required=t["action_required"],
                impacted_internal_doc=t.get("impacted_internal_doc"),
                output_type=t["output_type"]
            )
            db.add(task)
            
        await db.commit()
        return {"message": "Tải lên thành công"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))