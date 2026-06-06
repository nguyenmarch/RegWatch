import json
import os
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.db import get_db
from app.models.phase3 import ActionPlan, ActionPlanTask, Phase3Document
from app.schemas.phase3 import (
    ActionPlanResponse,
    ApprovalRequest,
    DocumentGenerateRequest,
    GroupDocumentGenerateRequest,
    Phase3DocumentResponse,
    Phase3DocumentUpdate,
)
from app.services.llm_generation import (
    get_old_document_from_qdrant,
    generate_phase3_html,
    get_old_document_from_qdrant_group,
    generate_phase3_html_group,
)

router = APIRouter(prefix="/phase3", tags=["Phase 3"])



@router.get("/action-plans", response_model=List[ActionPlanResponse])
async def list_action_plans(db: AsyncSession = Depends(get_db)):
    """Lấy danh sách Action Plan kèm theo các Task bên trong (Đồng bộ từ Qdrant)"""
    
    # Đồng bộ từ Qdrant action_plan_collection sang MySQL trước
    from app.core.qdrant_client import qdrant_client
    from app.core.enums import KbType
    
    try:
        res, _ = qdrant_client.scroll(collection_name=KbType.ACTION_PLAN.collection_name, limit=100)
        for hit in res:
            try:
                data = json.loads(hit.payload['text'])
                if "action_plan_id" not in data:
                    continue
                    
                # Kiểm tra xem đã có trong DB chưa
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
                pass # Bỏ qua nếu parse lỗi hoặc data không đúng format
    except Exception as e:
        pass # Bỏ qua nếu collection chưa tồn tại hoặc lỗi Qdrant
        
    # Load Eagerly các tasks và document tương ứng
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


@router.post("/generate", response_model=Phase3DocumentResponse)
async def generate_document(
    req: DocumentGenerateRequest,
    db: AsyncSession = Depends(get_db)
):
    """Gọi LLM sinh văn bản dựa trên Task ID cụ thể"""
    
    # Kiểm tra xem Task có tồn tại không
    result = await db.execute(select(ActionPlanTask).where(ActionPlanTask.id == req.task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task không tồn tại")

    # Lấy văn bản đang tồn tại để cập nhật JSON
    result_doc = await db.execute(
        select(Phase3Document).where(Phase3Document.task_id == req.task_id)
    )
    existing_doc = result_doc.scalars().first()

    try:
        content_dict = json.loads(existing_doc.content) if existing_doc and existing_doc.content else {}
    except Exception:
        content_dict = {}

    if req.generation_type == "document":
        old_doc = await get_old_document_from_qdrant(task)
        content_dict["old_document"] = old_doc
        modified_doc = await generate_phase3_html(task, "document", old_doc, req.refinement_prompt)
        content_dict["modified_document"] = modified_doc
    else:
        # announcement
        announcement = await generate_phase3_html(task, "announcement", "", req.refinement_prompt)
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
        new_doc = Phase3Document(
            task_id=req.task_id,
            content=new_content_str,
            status="DRAFT"
        )
        db.add(new_doc)
        await db.commit()
        await db.refresh(new_doc)
        return new_doc


@router.post("/generate-group", response_model=List[Phase3DocumentResponse])
async def generate_document_group(
    req: GroupDocumentGenerateRequest,
    db: AsyncSession = Depends(get_db)
):
    """Gọi LLM sinh văn bản gộp dựa trên danh sách Task IDs"""
    if not req.task_ids:
        raise HTTPException(status_code=400, detail="Danh sách Task ID trống")

    # Lấy các task
    result = await db.execute(select(ActionPlanTask).where(ActionPlanTask.id.in_(req.task_ids)))
    tasks = result.scalars().all()
    if len(tasks) != len(req.task_ids):
        raise HTTPException(status_code=404, detail="Một hoặc nhiều Task không tồn tại")

    # Lấy văn bản cũ chung từ Qdrant
    if req.generation_type == "document":
        old_doc = await get_old_document_from_qdrant_group(tasks)
        modified_doc = await generate_phase3_html_group(tasks, "document", old_doc, req.refinement_prompt)
    else:
        old_doc = ""
        modified_doc = ""
        
    announcement = ""
    if req.generation_type == "announcement":
        announcement = await generate_phase3_html_group(tasks, "announcement", "", req.refinement_prompt)

    generated_docs = []
    # Lưu kết quả cho từng task
    for task in tasks:
        result_doc = await db.execute(
            select(Phase3Document).where(Phase3Document.task_id == task.id)
        )
        existing_doc = result_doc.scalars().first()

        try:
            content_dict = json.loads(existing_doc.content) if existing_doc and existing_doc.content else {}
        except Exception:
            content_dict = {}

        if req.generation_type == "document":
            content_dict["old_document"] = old_doc
            try:
                import json
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
            new_doc = Phase3Document(
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



@router.put("/documents/{doc_id}", response_model=Phase3DocumentResponse)
async def update_document(
    doc_id: int,
    req: Phase3DocumentUpdate,
    db: AsyncSession = Depends(get_db)
):
    """User chỉnh sửa tay văn bản"""
    result = await db.execute(select(Phase3Document).where(Phase3Document.id == doc_id))
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


@router.post("/documents/{doc_id}/approve", response_model=Phase3DocumentResponse)
async def approve_document(
    doc_id: int,
    req: ApprovalRequest,
    db: AsyncSession = Depends(get_db)
):
    """Product hoặc CD duyệt văn bản"""
    result = await db.execute(select(Phase3Document).where(Phase3Document.id == doc_id))
    doc = result.scalars().first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy văn bản")
        
    if req.role.lower() == "product":
        doc.product_approved = True
    elif req.role.lower() == "cd":
        doc.cd_approved = True
    else:
        raise HTTPException(status_code=400, detail="Role không hợp lệ. Vui lòng gửi 'product' hoặc 'cd'")
        
    # Check nếu cả 2 đã duyệt
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
    """Người dùng upload trực tiếp file action-plan.json"""
    try:
        content = await file.read()
        data = json.loads(content)
        
        # Check if already exists to avoid duplicates
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
