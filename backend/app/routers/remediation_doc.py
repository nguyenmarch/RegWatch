import asyncio
import json
import logging
import os
from typing import List, Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.db import get_db
from app.core.deps import get_current_user

from app.models.remediation_doc import RemediationDoc, DraftVersion
from app.models.report import Report
from app.models.analysis import ComplianceAnalysis
from app.schemas.remediation_doc import (
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

router = APIRouter(
    prefix="/remediation",
    tags=["Remediation"],
    dependencies=[Depends(get_current_user)],
)

class TaskProxy:
    """Helper class to pass task dicts to LLM generation functions."""
    def __init__(self, **entries):
        self.id = entries.get("task_id")
        self.task_code = entries.get("task_id")
        self.task_name = entries.get("task_name")
        self.target_department = entries.get("target_department")
        self.action_required = entries.get("action_required")
        self.impacted_internal_doc = entries.get("impacted_internal_doc")
        self.output_type = entries.get("output_type")
        self.__dict__.update(entries)


async def _get_action_plan_tasks(db: AsyncSession, plan_id: str = None) -> List[Dict]:
    """Lấy danh sách các action plan từ Report table."""
    reports_result = await db.execute(
        select(Report, ComplianceAnalysis)
        .join(ComplianceAnalysis, Report.analyses_id == ComplianceAnalysis.id)
    )
    reports_data = reports_result.all()
    
    action_plans = []
    for report, analyses in reports_data:
        payload = report.items or {}
        if payload.get("workflow_status") != "issued":
            continue
            
        action_plan_id = f"AP-{analyses.code or str(analyses.id)}"
        
        if plan_id and action_plan_id != plan_id:
            continue
            
        action_plan = payload.get("action_plan")
        if not action_plan:
            tasks = []
            for idx, item in enumerate(payload.get("report_items") or [], start=1):
                priority = str(item.get("estimated_risk") or "").strip().upper()
                if not priority:
                    priority = "MEDIUM"
                    
                status_raw = str(item.get("status") or "").strip().lower()
                task_status = "OPEN"
                if status_raw in ("đã chốt", "completed", "done"):
                    task_status = "DONE"
                    
                tasks.append({
                    "id": f"TSK-{idx:03d}",
                    "task_id": f"TSK-{idx:03d}",
                    "task_name": str(item.get("code") or item.get("report_description") or f"Task {idx}"),
                    "priority": priority,
                    "target_department": str(item.get("responsible_department") or ""),
                    "action_required": str(item.get("report_description") or ""),
                    "impacted_internal_doc": str(item.get("impacted_internal_doc") or ""),
                    "output_type": str(item.get("deliverable_type") or "process_update"),
                    "deadline": str(item.get("target_date") or ""),
                    "task_status": task_status,
                })
                
            action_plan = {
                "id": action_plan_id,
                "action_plan_id": action_plan_id,
                "plan_code": action_plan_id,
                "associated_law": {
                    "law_id": "",
                    "law_title": analyses.title,
                },
                "metadata": {
                    "created_at": payload.get("ceo_approval", {}).get("approved_at", ""),
                    "created_by": "",
                    "status": "APPROVED",
                },
                "tasks": tasks
            }
        else:
            action_plan["id"] = action_plan_id
            action_plan["plan_code"] = action_plan_id
            for task in action_plan.get("tasks", []):
                task["id"] = task.get("task_id")
                action_req = str(task.get("action_required") or "")
                if action_req and str(task.get("task_name", "")) not in action_req:
                    task["task_name"] = f"{task.get('task_name', '')} - {action_req}"
            
        action_plans.append(action_plan)
        
    return action_plans


@router.get("/action-plans", response_model=List[dict])
async def list_action_plans(db: AsyncSession = Depends(get_db)):
    """
    [Mục đích]: Lấy danh sách Action Plan kèm Tasks trực tiếp từ Report đã ban hành.
    """
    try:
        action_plans = await _get_action_plan_tasks(db)
        
        # Load all remediation docs in one query to attach to tasks
        docs_result = await db.execute(select(RemediationDoc))
        docs = docs_result.scalars().all()
        doc_map = {(d.plan_id, d.task_id): d for d in docs}
        
        for plan in action_plans:
            for task in plan.get("tasks", []):
                doc = doc_map.get((plan["plan_code"], task["task_id"]))
                if doc:
                    task["document"] = {
                        "id": doc.id,
                        "plan_id": doc.plan_id,
                        "task_id": doc.task_id,
                        "content": doc.content,
                        "product_approved": doc.product_approved,
                        "cd_approved": doc.cd_approved,
                        "status": doc.status,
                        "created_at": doc.created_at.isoformat() if doc.created_at else None,
                        "updated_at": doc.updated_at.isoformat() if doc.updated_at else None
                    }
                else:
                    task["document"] = None
                    
        return action_plans
    except Exception as e:
        logger.error(f"Error getting action plans from report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate", response_model=RemediationDocResponse)
async def generate_document(
    req: DocumentGenerateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    [Mục đích]: Gọi LLM sinh văn bản đơn lẻ cho 1 Task cụ thể.
    """
    plans = await _get_action_plan_tasks(db, req.plan_id)
    if not plans:
        raise HTTPException(status_code=404, detail="Action Plan không tồn tại")
        
    plan = plans[0]
    task_dict = next((t for t in plan.get("tasks", []) if t["task_id"] == req.task_id), None)
    if not task_dict:
        raise HTTPException(status_code=404, detail="Task không tồn tại trong Action Plan")
        
    task_proxy = TaskProxy(**task_dict)

    result_doc = await db.execute(
        select(RemediationDoc).where(
            RemediationDoc.plan_id == req.plan_id,
            RemediationDoc.task_id == req.task_id
        )
    )
    existing_doc = result_doc.scalars().first()

    try:
        content_dict = json.loads(existing_doc.content) if existing_doc and existing_doc.content else {}
    except Exception:
        content_dict = {}

    if req.generation_type == "document":
        old_doc = await get_old_document_from_qdrant(task_proxy)
        content_dict["old_document"] = old_doc
        # get_old_document_from_qdrant backfills task_proxy.impacted_internal_doc
        # (via internal KB search). Persist it so approve → upsert dùng đúng tên.
        if task_proxy.impacted_internal_doc:
            content_dict["impacted_internal_doc"] = task_proxy.impacted_internal_doc
        modified_doc = await generate_remediation_html(task_proxy, "document", old_doc, req.refinement_prompt)
        try:
            gen_data = json.loads(modified_doc)
            content_dict["modified_document"] = gen_data.get("modified_document_html", modified_doc)
            content_dict["comments"] = gen_data.get("comments", [])
        except Exception as e:
            content_dict["modified_document"] = modified_doc
            content_dict["comments"] = []
    else:
        announcement = await generate_remediation_html(task_proxy, "announcement", "", req.refinement_prompt)
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
            plan_id=req.plan_id,
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
    [Mục đích]: Gọi LLM sinh văn bản GỘP (Merge) dựa trên danh sách (plan_id, task_id).
    """
    if not req.tasks:
        raise HTTPException(status_code=400, detail="Danh sách Task trống")

    plans = await _get_action_plan_tasks(db)
    
    task_proxies = []
    for t_req in req.tasks:
        plan = next((p for p in plans if p.get("plan_code") == t_req.plan_id), None)
        if plan:
            task_dict = next((t for t in plan.get("tasks", []) if t["task_id"] == t_req.task_id), None)
            if task_dict:
                task_proxy = TaskProxy(**task_dict)
                task_proxy.plan_id = t_req.plan_id
                task_proxies.append(task_proxy)
                
    if len(task_proxies) != len(req.tasks):
        raise HTTPException(status_code=404, detail="Một hoặc nhiều Task không tồn tại")

    if req.generation_type == "document":
        old_doc = await get_old_document_from_qdrant_group(task_proxies)
        modified_doc = await generate_remediation_html_group(task_proxies, "document", old_doc, req.refinement_prompt)
    else:
        old_doc = ""
        modified_doc = ""
        
    announcement = ""
    if req.generation_type == "announcement":
        announcement = await generate_remediation_html_group(task_proxies, "announcement", "", req.refinement_prompt)

    generated_docs = []
    for task_proxy in task_proxies:
        result_doc = await db.execute(
            select(RemediationDoc).where(
                RemediationDoc.plan_id == task_proxy.plan_id,
                RemediationDoc.task_id == task_proxy.task_id
            )
        )
        existing_doc = result_doc.scalars().first()

        try:
            content_dict = json.loads(existing_doc.content) if existing_doc and existing_doc.content else {}
        except Exception:
            content_dict = {}

        if req.generation_type == "document":
            content_dict["old_document"] = old_doc
            # Persist văn bản nội bộ đã resolve (qua search) để approve → upsert dùng.
            if task_proxy.impacted_internal_doc:
                content_dict["impacted_internal_doc"] = task_proxy.impacted_internal_doc
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
                plan_id=task_proxy.plan_id,
                task_id=task_proxy.task_id,
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


@router.post("/documents/{doc_id}/save-draft", response_model=List[DraftVersionResponse])
async def save_draft(
    doc_id: int,
    req: SaveDraftRequest,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(RemediationDoc).where(RemediationDoc.id == doc_id))
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy văn bản")

    draft = DraftVersion(
        remediation_doc_id=doc_id,
        content=req.content,
        saved_by=req.saved_by,
    )
    db.add(draft)

    doc.content = req.content
    doc.status = "PENDING"
    doc.product_approved = False
    doc.cd_approved = False

    await db.commit()

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

    doc.content = draft.content
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
    result = await db.execute(
        select(RemediationDoc).where(RemediationDoc.id == doc_id)
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

        try:
            content_dict = json.loads(doc.content) if doc.content else {}
        except Exception:
            content_dict = {}

        # Fetch the task info from Report to pass to LLM
        plans = await _get_action_plan_tasks(db, doc.plan_id)
        plan = plans[0] if plans else {}
        task_dict = next((t for t in plan.get("tasks", []) if t["task_id"] == doc.task_id), {})
        task_proxy = TaskProxy(**task_dict) if task_dict else None

        try:
            resolved_comments = [
                c for c in content_dict.get("comments", [])
                if c.get("resolved", False)
            ]
            if resolved_comments and task_proxy:
                resolved_info = "\n".join([
                    f"- {c.get('task_name', 'N/A')}: {c.get('reason', 'N/A')}"
                    for c in resolved_comments
                ])
                refinement = f"Chỉ sinh VB đào tạo dựa trên các thay đổi ĐÃ HOÀN THÀNH sau:\n{resolved_info}"
                announcement_json = await generate_remediation_html(task_proxy, "announcement", "", refinement)
                try:
                    ann_data = json.loads(announcement_json)
                    content_dict["announcement"] = ann_data.get("announcement", announcement_json)
                except Exception:
                    content_dict["announcement"] = announcement_json
                doc.content = json.dumps(content_dict, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to generate announcement on approve: {e}")

        try:
            # Tên văn bản nội bộ: ưu tiên giá trị đã resolve & lưu lúc generate,
            # fallback về task (nếu phase 2 có cung cấp).
            impacted_doc_name = content_dict.get("impacted_internal_doc") or (
                task_proxy.impacted_internal_doc if task_proxy else ""
            )
            if impacted_doc_name and content_dict.get("modified_document"):
                from app.services.qdrant_service import upsert_approved_to_internal
                await asyncio.to_thread(
                    upsert_approved_to_internal,
                    doc_name=impacted_doc_name,
                    html_content=content_dict["modified_document"],
                    task_id=f"{doc.plan_id}_{doc.task_id}",
                )
        except Exception as e:
            logger.error(f"Failed to upsert to Qdrant internal_collection: {e}")

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
