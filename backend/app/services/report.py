import logging
import json
import re
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import settings
from app.core.gemini_client import get_gemini_client
from app.models.report import Report
from app.models.analysis import ComplianceAnalysis
from app.models.action_plan import ActionPlan


logger = logging.getLogger(__name__)
_MAX_DEADLINE_LEN = 255


def _normalize_deadline(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:_MAX_DEADLINE_LEN]


def _normalize_budget(value: Any) -> int:
    if value is None or value == "":
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return max(0, int(value))

    text = str(value).strip()
    if not text:
        return 0

    match = re.search(r"\d[\d.,]*", text)
    if not match:
        return 0
    amount = match.group(0)

    if "," in amount and "." in amount:
        if amount.rfind(",") > amount.rfind("."):
            amount = amount.replace(".", "").replace(",", ".")
        else:
            amount = amount.replace(",", "")
    elif "," in amount:
        amount = amount.replace(",", "")
    else:
        parts = amount.split(".")
        if len(parts) > 1 and all(len(part) == 3 for part in parts[1:]):
            amount = "".join(parts)

    try:
        return max(0, int(float(amount)))
    except ValueError:
        return 0


class AnalysesNotFoundError(Exception):
    pass


class EmptyReportError(Exception):
    pass


class IncompleteReportError(Exception):
    pass


class ReportLockedError(Exception):
    pass


class ReportService:

    _DEFAULT_WORKFLOW_STATUS = "draft"
    _ALLOWED_DEPARTMENTS = (
        "Khối Công nghệ",
        "Khối Vận hành",
        "Khối Pháp chế",
        "Khối BoD",
        "Khối Marketing",
    )
    _ALLOWED_RISK_LEVELS = ("Cao", "Trung bình", "Thấp")
    _DEFAULT_RISK_REPORT = {
        "risk_level": "",
        "estimated_budget": 0,
        "business_impact": "",
        "compliance_recommendation": "",
        "report_summary": "",
        "submitted_by": "",
        "submitted_at": "",
    }
    _DEFAULT_CEO_APPROVAL = {
        "status": "pending",
        "approved_by": "",
        "approved_at": "",
        "approval_note": "",
    }
    _DEFAULT_ISSUED_PLAN = {
        "issued_by": "",
        "issued_at": "",
        "effective_from": "",
        "version": "v1",
        "signed_document_ref": "",
        "issue_note": "",
    }

    _SEVERITY_MAP = {
        "urgent": "CRITICAL",
        "critical": "CRITICAL",
        "very_high": "CRITICAL",
        "very high": "CRITICAL",
        "cao nhất": "CRITICAL",
        "nghiêm trọng": "CRITICAL",
        "high": "HIGH",
        "cao": "HIGH",
        "review": "MEDIUM",
        "medium": "MEDIUM",
        "moderate": "MEDIUM",
        "trung bình": "MEDIUM",
        "monitor": "LOW",
        "low": "LOW",
        "thấp": "LOW",
    }

    _NON_SEVERITY_STATUSES = {"review", "pending", "open"}
    _RISK_KEYS = ("severity", "level", "risk", "label", "overall_risk")
    _LLM_FALLBACK_RECOMMENDATIONS = [
        "Kiểm tra các quy trình hiện tại và xác định những lỗ hổng bảo mật",
        "Cập nhật các chính sách nội bộ để tuân thủ các yêu cầu mới",
        "Đào tạo nhân viên về các quy định mới",
        "Thiết lập hệ thống giám sát để theo dõi tuân thủ",
    ]

    _LLM_FALLBACK_RECOMMENDATION_ROWS = [
        {
            "id": 1,
            "analyses_id": 0,
            "report_description": "Rà soát quy trình hiện tại và xác định khoảng cách tuân thủ",
            "responsible_department": "Khối Pháp chế",
            "target_date": "",
            "estimated_budget": 0,
            "estimated_risk": "Cao",
            "code": "REC-001",
            "status": "Cần xử lý",
            "deliverable_type": "process_update",
            "owner_role": "Compliance Department / Risk Manager",
            "co_owner_role": "Product / IT / PO",
            "dependency": "",
            "evidence_document": "",
        }
    ]

    async def list_analyses(self, db: AsyncSession) -> list[dict[str, Any]]:
        result = await db.execute(
            select(ComplianceAnalysis)
            .where(ComplianceAnalysis.status.in_(["processed", "finalized"]))
            .order_by(ComplianceAnalysis.created_at.desc())
        )
        return [self._serialize_analyses(analyses) for analyses in result.scalars().all()]

    async def upsert_analyses(
        self, db: AsyncSession, data: dict[str, Any]
    ) -> dict[str, Any]:
        code = (data.get("code") or data.get("analyses_code") or "").strip()
        if not code:
            code = f"ANALYSES-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

        result = await db.execute(
            select(ComplianceAnalysis).where(ComplianceAnalysis.code == code)
        )
        analyses = result.scalar_one_or_none()

        values = {
            "code": code,
            "document_id": data.get("document_id"),
            "title": data.get("title") or code,
            "summary": data.get("summary") or data.get("description") or "",
            "conflict_headline": data.get("conflict_headline") or "",
            "severity": data.get("severity") or "monitor",
            "deadline": _normalize_deadline(data.get("deadline")),
            "status": data.get("status") or "pending",
            "overall_risk": data.get("overall_risk") if isinstance(data.get("overall_risk"), dict) else {},
            "compare_left": data.get("compare_left"),
            "compare_right": data.get("compare_right"),
            "conflict_note": data.get("conflict_note") or "",
            "business_impacts": data.get("business_impacts") or [],
            "risk_scores": data.get("risk_scores") or [],
            "risk_conclusion": data.get("risk_conclusion") or "",
            "detail_tables": data.get("detail_tables") or [],
            "generated_at": self._parse_datetime(data.get("generated_at")) or datetime.utcnow(),
        }

        if analyses is None:
            analyses = ComplianceAnalysis(**values)
            db.add(analyses)
        else:
            for key, value in values.items():
                setattr(analyses, key, value)

        await db.commit()
        await db.refresh(analyses)
        return self._serialize_analyses(analyses)

    async def get_report_items(
        self, db: AsyncSession, analyses_id: int
    ) -> list[dict[str, Any]]:
        # Tích hợp: nếu Report chưa có items thì tự sinh từ Analysis
        report = await self._get_report(db, analyses_id)
        if report is None:
            analyses = await self._get_analyses(db, analyses_id)
            if analyses is None:
                return []
            return self._generate_report_items_from_analyses(analyses)

        payload = self._normalize_plan_payload(analyses_id, report.items)
        if not payload["report_items"]:
            analyses = await self._get_analyses(db, analyses_id)
            if analyses is not None:
                payload["report_items"] = self._generate_report_items_from_analyses(analyses)

        return payload["report_items"]

    def _generate_report_items_from_analyses(
        self, analyses: ComplianceAnalysis
    ) -> list[dict[str, Any]]:
        # Mapping tối thiểu: mỗi analyses row tương ứng 1 report item.
        risk_label = ""
        if isinstance(analyses.overall_risk, dict):
            risk_label = analyses.overall_risk.get("label") or ""

        estimated_risk = risk_label or self._normalize_severity(analyses.severity)

        description = ""
        if getattr(analyses, "conflict_headline", None):
            description = analyses.conflict_headline or ""
        if getattr(analyses, "conflict_note", None):
            description = (description + "\n" if description else "") + (analyses.conflict_note or "")

        return [
            {
                "id": 1,
                "analyses_id": analyses.id,
                "report_description": description or analyses.summary or "",
                "responsible_department": "",
                "target_date": "",
                "estimated_budget": 0,
                "estimated_risk": estimated_risk,
                "code": analyses.code or "",
                "status": "Cần xử lý",
                "deliverable_type": "process_update",
                "owner_role": "Compliance Department / Risk Manager",
                "co_owner_role": "",
                "dependency": "",
                "evidence_document": "",
            }
        ]

    async def get_report(
        self, db: AsyncSession, analyses_id: int
    ) -> dict[str, Any]:
        analyses = await self._get_analyses(db, analyses_id)
        if analyses is None:
            raise AnalysesNotFoundError

        report = await self._get_report(db, analyses_id)
        payload = report.items if report else None
        normalized = self._normalize_plan_payload(analyses_id, payload)

        # Tích hợp: nếu Report chưa có report_items thì tự sinh từ Analysis.
        if not normalized.get("report_items"):
            normalized["report_items"] = self._generate_report_items_from_analyses(analyses)
        return normalized


    async def update_report(
        self, db: AsyncSession, analyses_id: int, update_data: dict[str, Any]
    ) -> dict[str, Any]:
        analyses = await self._get_analyses(db, analyses_id)
        if analyses is None:
            raise AnalysesNotFoundError
        if analyses.status == "finalized":
            raise ReportLockedError

        report = await self._get_report(db, analyses_id)
        payload = self._normalize_plan_payload(analyses_id, report.items if report else None)

        for key in ("workflow_status", "risk_report", "ceo_approval", "issued_plan"):
            if update_data.get(key) is not None:
                payload[key] = update_data[key]
        if update_data.get("report_items") is not None:
            payload["report_items"] = update_data["report_items"]

        if report is None:
            report = Report(analyses_id=analyses_id, items=payload)
            db.add(report)
        else:
            report.items = payload
            flag_modified(report, "items")

        await db.commit()
        return payload

    async def save_report_items(
        self, db: AsyncSession, analyses_id: int, items: list[dict[str, Any]]
    ) -> int:
        analyses = await self._get_analyses(db, analyses_id)
        if analyses is None:
            raise AnalysesNotFoundError
        if analyses.status == "finalized":
            raise ReportLockedError

        report = await self._get_report(db, analyses_id)
        payload = self._normalize_plan_payload(analyses_id, report.items if report else None)
        payload["report_items"] = items
        if report is None:
            report = Report(analyses_id=analyses_id, items=payload)
            db.add(report)
        else:
            report.items = payload
            flag_modified(report, "items")

        await db.commit()
        return len(items)

    async def finalize_report(
        self, db: AsyncSession, analyses_id: int
    ) -> dict[str, Any]:
        analyses = await self._get_analyses(db, analyses_id)
        if analyses is None:
            raise AnalysesNotFoundError

        report = await self._get_report(db, analyses_id)
        payload = self._normalize_plan_payload(analyses_id, report.items if report else None)
        if not payload["report_items"]:
            payload["report_items"] = self._generate_report_items_from_analyses(analyses)
        if not payload["report_items"]:
            raise EmptyReportError
        if not self._report_items_complete(payload["report_items"]):
            raise IncompleteReportError

        finalized_at = datetime.utcnow().isoformat()
        payload["workflow_status"] = "issued"
        payload["ceo_approval"] = {
            **self._DEFAULT_CEO_APPROVAL,
            **payload.get("ceo_approval", {}),
            "status": "approved",
            "approved_at": payload.get("ceo_approval", {}).get("approved_at") or finalized_at,
        }
        payload["issued_plan"] = {
            **self._DEFAULT_ISSUED_PLAN,
            **payload.get("issued_plan", {}),
            "issued_at": payload.get("issued_plan", {}).get("issued_at") or finalized_at,
        }

        if report is None:
            report = Report(analyses_id=analyses_id, items=payload)
            db.add(report)
        else:
            report.items = payload
            flag_modified(report, "items")
        analyses.status = "finalized"
        await db.commit()

        # Backward compatibility: keep existing report dossier.
        # Additionally, build Action Plan JSON in the same finalize response payload.
        action_plan_id = f"AP-{analyses.code or str(analyses.id)}"
        tasks = []
        for idx, item in enumerate(payload.get("report_items") or [], start=1):
            estimated_risk = str(item.get("estimated_risk") or "").strip()
            priority = estimated_risk
            if priority.lower() in self._SEVERITY_MAP:
                priority = self._SEVERITY_MAP[priority.lower()]
            if not priority:
                priority = "MEDIUM"

            status_raw = str(item.get("status") or "").strip()
            task_status = "OPEN"
            if status_raw.lower() in ("đã chốt", "completed", "done"):
                task_status = "DONE"

            tasks.append(
                {
                    "task_id": f"TSK-{idx:03d}",
                    "task_name": str(item.get("code") or item.get("report_description") or f"Task {idx}"),
                    "priority": priority,
                    "target_department": str(item.get("responsible_department") or ""),
                    "action_required": str(item.get("report_description") or ""),
                    "impacted_internal_doc": "",
                    "output_type": str(item.get("deliverable_type") or "process_update"),
                    "deadline": str(item.get("target_date") or ""),
                    "estimated_budget": _normalize_budget(item.get("estimated_budget")),
                    "estimated_budget_vnd": _normalize_budget(item.get("estimated_budget")),
                    "task_status": task_status,
                }
            )

        action_plan = {
            "action_plan_id": action_plan_id,
            "associated_law": {
                "law_id": "",
                "law_title": "",
                "effective_date": "",
            },
            "metadata": {
                "created_at": finalized_at,
                "created_by": "",
                "status": payload.get("ceo_approval", {}).get("status", "APPROVED").upper(),
                "ceo_approved_at": payload.get("ceo_approval", {}).get("approved_at", ""),
            },
            "tasks": tasks,
        }
        payload["action_plan"] = action_plan
        report.items = payload
        flag_modified(report, "items")
        await db.commit()

        return {
            "analyses_code": analyses.code,
            "analyses_title": analyses.title,
            "analyses_severity": analyses.severity,
            "finalized_at": finalized_at,
            "report_items": payload["report_items"],
            "workflow_status": payload["workflow_status"],
            "risk_report": payload["risk_report"],
            "ceo_approval": payload["ceo_approval"],
            "issued_plan": payload["issued_plan"],
            "action_plan": action_plan,
        }


    async def generate_recommendations(self, prompt: str) -> list[dict[str, Any]]:
        try:
            client = get_gemini_client()
            structured_prompt = (
                prompt
                + "\n\nReturn ONLY a valid JSON array. Each item must contain: "
                "report_description, responsible_department, target_date, estimated_budget, "
                "estimated_risk, code, status, deliverable_type, owner_role, co_owner_role, "
                "dependency, evidence_document. No markdown. "
                "responsible_department MUST be exactly one of: "
                f"{', '.join(self._ALLOWED_DEPARTMENTS)}. "
                "estimated_risk MUST be exactly one of: "
                f"{', '.join(self._ALLOWED_RISK_LEVELS)}."
            )
            response = await client.aio.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=structured_prompt,
            )
            return self._parse_recommendations(response.text or "")
        except Exception as exc:
            logger.error("Failed to generate LLM recommendations: %s", exc)
            return self._LLM_FALLBACK_RECOMMENDATION_ROWS

    async def _get_analyses(
        self, db: AsyncSession, analyses_id: int
    ) -> ComplianceAnalysis | None:
        result = await db.execute(select(ComplianceAnalysis).where(ComplianceAnalysis.id == analyses_id))
        return result.scalar_one_or_none()

    async def _get_report(
        self, db: AsyncSession, analyses_id: int
    ) -> Report | None:
        result = await db.execute(select(Report).where(Report.analyses_id == analyses_id))
        return result.scalar_one_or_none()

    def _normalize_plan_payload(self, analyses_id: int, payload: Any) -> dict[str, Any]:
        if isinstance(payload, list):
            report_items = payload
            raw = {}
        elif isinstance(payload, dict):
            raw = payload
            report_items = raw.get("report_items")
            if report_items is None:
                report_items = raw.get("items", [])
        else:
            raw = {}
            report_items = []

        result = {
            "analyses_id": analyses_id,
            "workflow_status": raw.get("workflow_status") or self._DEFAULT_WORKFLOW_STATUS,
            "risk_report": {
                **self._DEFAULT_RISK_REPORT,
                **(raw.get("risk_report") if isinstance(raw.get("risk_report"), dict) else {}),
            },
            "ceo_approval": {
                **self._DEFAULT_CEO_APPROVAL,
                **(raw.get("ceo_approval") if isinstance(raw.get("ceo_approval"), dict) else {}),
            },
            "issued_plan": {
                **self._DEFAULT_ISSUED_PLAN,
                **(raw.get("issued_plan") if isinstance(raw.get("issued_plan"), dict) else {}),
            },
            "report_items": self._normalize_report_items(analyses_id, report_items),
        }
        result["risk_report"]["estimated_budget"] = _normalize_budget(
            result["risk_report"].get("estimated_budget")
        )
        result["action_plan"] = self._normalize_action_plan(
            raw.get("action_plan"),
            result["report_items"],
        )
        return result

    @staticmethod
    def _normalize_action_plan(action_plan: Any, report_items: list[dict[str, Any]]) -> dict[str, Any] | None:
        if not isinstance(action_plan, dict):
            return None

        normalized = {**action_plan}
        tasks = action_plan.get("tasks")
        if not isinstance(tasks, list):
            return normalized

        normalized_tasks = []
        for idx, task in enumerate(tasks):
            if not isinstance(task, dict):
                continue
            item = report_items[idx] if idx < len(report_items) else {}
            budget = _normalize_budget(
                task.get("estimated_budget")
                or task.get("estimated_budget_vnd")
                or item.get("estimated_budget")
            )
            normalized_task = {**task}
            normalized_task["estimated_budget"] = budget
            normalized_task["estimated_budget_vnd"] = budget
            normalized_tasks.append(normalized_task)

        normalized["tasks"] = normalized_tasks
        return normalized

    @staticmethod
    def _normalize_report_items(analyses_id: int, items: Any) -> list[dict[str, Any]]:
        if not isinstance(items, list):
            return []

        normalized = []
        for idx, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                continue
            normalized.append({
                "id": item.get("id") or idx,
                "analyses_id": item.get("analyses_id") or analyses_id,
                "report_description": item.get("report_description") or "",
                "responsible_department": item.get("responsible_department") or "",
                "target_date": item.get("target_date") or "",
                "estimated_budget": _normalize_budget(item.get("estimated_budget")),
                "estimated_risk": item.get("estimated_risk") or "",
                "code": item.get("code") or "",
                "status": item.get("status") or "Cần xử lý",
                "deliverable_type": item.get("deliverable_type") or "process_update",
                "owner_role": item.get("owner_role") or "Compliance Department / Risk Manager",
                "co_owner_role": item.get("co_owner_role") or "",
                "dependency": item.get("dependency") or "",
                "evidence_document": item.get("evidence_document") or "",
            })
        return normalized

    def _serialize_analyses(self, analyses: ComplianceAnalysis) -> dict[str, Any]:
        return {
            "id": analyses.id,
            "analyses_code": analyses.code or "",
            "severity": self._derive_severity(analyses),
            "title": analyses.title,
            "description": analyses.summary or "",
            "issued_date": analyses.created_at.strftime("%Y-%m-%d") if analyses.created_at else "",
            "due_date": analyses.deadline or "",
            "estimated_impact": self._extract_estimated_impact(analyses),
            "created_at": analyses.created_at.isoformat() if analyses.created_at else "",
            "status": analyses.status or "",
        }

    @staticmethod
    def _report_items_complete(items: list[dict[str, Any]]) -> bool:
        required_text_fields = (
            "report_description",
            "responsible_department",
            "target_date",
            "estimated_risk",
            "code",
            "status",
            "deliverable_type",
            "owner_role",
        )
        for item in items:
            for field in required_text_fields:
                if not str(item.get(field) or "").strip():
                    return False
            if _normalize_budget(item.get("estimated_budget")) <= 0:
                return False
        return True

    def _extract_estimated_impact(self, analyses: ComplianceAnalysis) -> str:
        if isinstance(analyses.business_impacts, dict):
            return analyses.business_impacts.get("estimated_impact", "N/A")
        if isinstance(analyses.business_impacts, list) and analyses.business_impacts:
            if isinstance(analyses.overall_risk, dict):
                return analyses.overall_risk.get("label", "N/A")
        return "N/A"

    def _derive_severity(self, analyses: ComplianceAnalysis) -> str:
        raw_severity = str(analyses.severity or "").strip()
        if raw_severity and raw_severity.lower() not in self._NON_SEVERITY_STATUSES:
            return self._normalize_severity(raw_severity)

        for source in (analyses.overall_risk, analyses.risk_scores):
            if isinstance(source, dict):
                for key in self._RISK_KEYS:
                    if source.get(key):
                        return self._normalize_severity(source.get(key))

        if isinstance(analyses.risk_scores, dict):
            score = analyses.risk_scores.get("score") or analyses.risk_scores.get("total_score")
            if isinstance(score, (int, float)):
                return self._severity_from_score(score)

        return self._normalize_severity(raw_severity)

    def _normalize_severity(self, value: Any) -> str:
        normalized = str(value or "").strip().lower()
        return self._SEVERITY_MAP.get(normalized, "MEDIUM")

    @staticmethod
    def _severity_from_score(score: int | float) -> str:
        if score >= 80:
            return "CRITICAL"
        if score >= 60:
            return "HIGH"
        if score >= 30:
            return "MEDIUM"
        return "LOW"

    def _parse_recommendations(self, text: str) -> list[dict[str, Any]]:
        cleaned = (text or "").strip()
        if not cleaned:
            return self._LLM_FALLBACK_RECOMMENDATION_ROWS

        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
        match = re.search(r"(\[.*\]|\{.*\})", cleaned, flags=re.DOTALL)
        candidate = match.group(1) if match else cleaned
        try:
            payload = json.loads(candidate)
            if isinstance(payload, dict):
                payload = payload.get("recommendations") or payload.get("items") or [payload]
            if isinstance(payload, list):
                rows = [
                    self._normalize_recommendation_item(index, item)
                    for index, item in enumerate(payload, start=1)
                    if isinstance(item, dict)
                ]
                if rows:
                    return rows
        except json.JSONDecodeError:
            pass

        rows = []
        for index, line in enumerate([line.strip() for line in cleaned.split("\n") if line.strip()], start=1):
            description = line.lstrip("*-0123456789. ")
            if description:
                rows.append(self._normalize_recommendation_item(index, {"report_description": description}))
        return rows or self._LLM_FALLBACK_RECOMMENDATION_ROWS

    @staticmethod
    def _normalize_recommendation_item(index: int, item: dict[str, Any]) -> dict[str, Any]:
        department = ReportService._normalize_allowed_value(
            item.get("responsible_department") or item.get("department") or item.get("target_department"),
            ReportService._ALLOWED_DEPARTMENTS,
            "Khối Pháp chế",
        )
        risk_level = ReportService._normalize_allowed_value(
            item.get("estimated_risk") or item.get("risk_level") or item.get("priority"),
            ReportService._ALLOWED_RISK_LEVELS,
            "Trung bình",
        )
        return {
            "id": item.get("id") or index,
            "analyses_id": item.get("analyses_id") or 0,
            "report_description": item.get("report_description") or item.get("action_required") or item.get("plan") or "",
            "responsible_department": department,
            "target_date": item.get("target_date") or item.get("deadline") or "",
            "estimated_budget": _normalize_budget(item.get("estimated_budget") or item.get("estimated_budget_vnd")),
            "estimated_risk": risk_level,
            "code": item.get("code") or item.get("task_code") or f"REC-{index:03d}",
            "status": item.get("status") or "Cần xử lý",
            "deliverable_type": item.get("deliverable_type") or item.get("output_type") or "process_update",
            "owner_role": item.get("owner_role") or "Compliance Department / Risk Manager",
            "co_owner_role": item.get("co_owner_role") or "",
            "dependency": item.get("dependency") or "",
            "evidence_document": item.get("evidence_document") or "",
        }

    @staticmethod
    def _normalize_allowed_value(value: Any, allowed: tuple[str, ...], fallback: str) -> str:
        raw = str(value or "").strip()
        if not raw:
            return fallback

        def key(text: str) -> str:
            normalized = text.lower().strip()
            replacements = str.maketrans({
                "à": "a", "á": "a", "ạ": "a", "ả": "a", "ã": "a",
                "â": "a", "ầ": "a", "ấ": "a", "ậ": "a", "ẩ": "a", "ẫ": "a",
                "ă": "a", "ằ": "a", "ắ": "a", "ặ": "a", "ẳ": "a", "ẵ": "a",
                "è": "e", "é": "e", "ẹ": "e", "ẻ": "e", "ẽ": "e",
                "ê": "e", "ề": "e", "ế": "e", "ệ": "e", "ể": "e", "ễ": "e",
                "ì": "i", "í": "i", "ị": "i", "ỉ": "i", "ĩ": "i",
                "ò": "o", "ó": "o", "ọ": "o", "ỏ": "o", "õ": "o",
                "ô": "o", "ồ": "o", "ố": "o", "ộ": "o", "ổ": "o", "ỗ": "o",
                "ơ": "o", "ờ": "o", "ớ": "o", "ợ": "o", "ở": "o", "ỡ": "o",
                "ù": "u", "ú": "u", "ụ": "u", "ủ": "u", "ũ": "u",
                "ư": "u", "ừ": "u", "ứ": "u", "ự": "u", "ử": "u", "ữ": "u",
                "ỳ": "y", "ý": "y", "ỵ": "y", "ỷ": "y", "ỹ": "y",
                "đ": "d",
            })
            return " ".join(normalized.translate(replacements).split())

        raw_key = key(raw)
        for option in allowed:
            option_key = key(option)
            if raw_key == option_key or option_key in raw_key or raw_key in option_key:
                return option
        return fallback

    @staticmethod
    def _parse_datetime(value: Any) -> datetime | None:
        if isinstance(value, datetime):
            return value
        if not value:
            return None
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None


report_service = ReportService()
