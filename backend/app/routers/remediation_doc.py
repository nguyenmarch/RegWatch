import asyncio
import json
import logging
import os
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.db import get_db

from app.models.remediation_doc import ActionPlan, ActionPlanTask, RemediationDoc, DraftVersion
from app.schemas.remediation_doc import (
    ActionPlanResponse,
    ApprovalRequest,
    DocumentGenerateRequest,
    DraftVersionResponse,
    GroupDocumentGenerateRequest,
    RemediationDocResponse,
    RemediationDocUpdate,
    SaveDraftRequest,
)
from app.services.llm_generation import (
    get_old_document_from_qdrant,
    generate_remediation_html,
    get_old_document_from_qdrant_group,
    generate_remediation_html_group,
)

logger = logging.getLogger(__name__)

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
        try:
            gen_data = json.loads(modified_doc)
            content_dict["modified_document"] = gen_data.get("modified_document_html", modified_doc)
            content_dict["comments"] = gen_data.get("comments", [])
        except Exception as e:
            # Fallback: if JSON parsing fails, treat as raw HTML
            content_dict["modified_document"] = modified_doc
            content_dict["comments"] = []
    else:
        announcement = await generate_remediation_html(task, "announcement", "", req.refinement_prompt)
        try:
            gen_data = json.loads(announcement)
            content_dict["announcement"] = gen_data.get("announcement", announcement)
        except Exception:
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
            except Exception as e:
                content_dict["modified_document"] = modified_doc
                content_dict["comments"] = []
        else:
            try:
                gen_data = json.loads(announcement)
                content_dict["announcement"] = gen_data.get("announcement", announcement)
            except Exception:
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


# ═══════════════════════════════════════════════════════════════
# DRAFT VERSION APIs — Lưu / Xem / Khôi phục bản nháp
# ═══════════════════════════════════════════════════════════════

@router.post("/documents/{doc_id}/save-draft", response_model=List[DraftVersionResponse])
async def save_draft(
    doc_id: int,
    req: SaveDraftRequest,
    db: AsyncSession = Depends(get_db)
):
    """Lưu snapshot content hiện tại vào bảng draft_versions, đồng thời update nội dung doc."""
    result = await db.execute(select(RemediationDoc).where(RemediationDoc.id == doc_id))
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy văn bản")

    # Lưu snapshot vào draft_versions
    draft = DraftVersion(
        remediation_doc_id=doc_id,
        content=req.content,
        saved_by=req.saved_by,
    )
    db.add(draft)

    # Cập nhật nội dung doc hiện tại
    doc.content = req.content
    doc.status = "PENDING"
    doc.product_approved = False
    doc.cd_approved = False

    await db.commit()

    # Trả về danh sách tất cả drafts (mới nhất trước)
    drafts_result = await db.execute(
        select(DraftVersion)
        .where(DraftVersion.remediation_doc_id == doc_id)
        .order_by(DraftVersion.created_at.desc())
    )
    return list(drafts_result.scalars().all())


@router.get("/documents/{doc_id}/drafts", response_model=List[DraftVersionResponse])
async def list_drafts(
    doc_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Lấy danh sách bản nháp đã lưu của một document."""
    result = await db.execute(
        select(DraftVersion)
        .where(DraftVersion.remediation_doc_id == doc_id)
        .order_by(DraftVersion.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/documents/{doc_id}/drafts/{draft_id}/restore", response_model=RemediationDocResponse)
async def restore_draft(
    doc_id: int,
    draft_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Khôi phục nội dung từ bản nháp cũ."""
    result = await db.execute(select(RemediationDoc).where(RemediationDoc.id == doc_id))
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy văn bản")

    draft_result = await db.execute(
        select(DraftVersion).where(
            DraftVersion.id == draft_id,
            DraftVersion.remediation_doc_id == doc_id
        )
    )
    draft = draft_result.scalars().first()
    if not draft:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản nháp")

    # Khôi phục nội dung
    doc.content = draft.content
    doc.status = "PENDING"
    doc.product_approved = False
    doc.cd_approved = False

    await db.commit()
    await db.refresh(doc)
    return doc


# ═══════════════════════════════════════════════════════════════
# APPROVE — Duyệt kép + Sinh VB Đào tạo + Upsert Qdrant + Xóa drafts
# ═══════════════════════════════════════════════════════════════

@router.post("/documents/{doc_id}/approve", response_model=RemediationDocResponse)
async def approve_document(
    doc_id: int,
    req: ApprovalRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Cơ chế duyệt kép (Dual-Approval) cho Khối Sản phẩm hoặc Khối Tuân thủ.
    Khi cả 2 bên đã duyệt (APPROVED):
      1. Sinh VB đào tạo (announcement) từ các comment resolved
      2. Upsert nội dung đã duyệt vào Qdrant internal_collection
      3. Xóa tất cả draft_versions (đã hoàn thành, không cần nháp nữa)
    """
    result = await db.execute(
        select(RemediationDoc)
        .options(selectinload(RemediationDoc.task))
        .where(RemediationDoc.id == doc_id)
    )
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

        # ── Khi APPROVED: thực hiện 3 bước ──
        try:
            content_dict = json.loads(doc.content) if doc.content else {}
        except Exception:
            content_dict = {}

        task = doc.task

        # 1. Sinh VB đào tạo từ resolved comments
        try:
            resolved_comments = [
                c for c in content_dict.get("comments", [])
                if c.get("resolved", False)
            ]
            if resolved_comments and task:
                # Build context từ resolved action items
                resolved_info = "\n".join([
                    f"- {c.get('task_name', 'N/A')}: {c.get('reason', 'N/A')}"
                    for c in resolved_comments
                ])
                refinement = f"Chỉ sinh VB đào tạo dựa trên các thay đổi ĐÃ HOÀN THÀNH sau:\n{resolved_info}"
                announcement_json = await generate_remediation_html(task, "announcement", "", refinement)
                try:
                    ann_data = json.loads(announcement_json)
                    content_dict["announcement"] = ann_data.get("announcement", announcement_json)
                except Exception:
                    content_dict["announcement"] = announcement_json
                doc.content = json.dumps(content_dict, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to generate announcement on approve: {e}")

        # 2. Upsert nội dung đã duyệt vào Qdrant internal_collection
        try:
            if task and task.impacted_internal_doc and content_dict.get("modified_document"):
                from app.services.qdrant_service import upsert_approved_to_internal
                await asyncio.to_thread(
                    upsert_approved_to_internal,
                    doc_name=task.impacted_internal_doc,
                    html_content=content_dict["modified_document"],
                    task_id=task.id,
                )
        except Exception as e:
            logger.error(f"Failed to upsert to Qdrant internal_collection: {e}")

        # 3. Xóa tất cả draft_versions (document đã hoàn thành)
        try:
            drafts_result = await db.execute(
                select(DraftVersion).where(DraftVersion.remediation_doc_id == doc_id)
            )
            for draft in drafts_result.scalars().all():
                await db.delete(draft)
        except Exception as e:
            logger.error(f"Failed to clean up drafts: {e}")

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