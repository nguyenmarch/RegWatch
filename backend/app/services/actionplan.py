import logging
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.gemini_client import get_gemini_client
from app.models.action_plan import ActionPlan
from app.models.alert import ComplianceAlert

logger = logging.getLogger(__name__)


class AlertNotFoundError(Exception):
    pass


class EmptyActionPlanError(Exception):
    pass


class ActionPlanService:
    _DEFAULT_WORKFLOW_STATUS = "draft"
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

    async def list_alerts(self, db: AsyncSession) -> list[dict[str, Any]]:
        result = await db.execute(
            select(ComplianceAlert).order_by(ComplianceAlert.created_at.desc())
        )
        return [self._serialize_alert(alert) for alert in result.scalars().all()]

    async def get_action_plan_items(
        self, db: AsyncSession, alert_id: int
    ) -> list[dict[str, Any]]:
        action_plan = await self._get_action_plan(db, alert_id)
        if action_plan is None:
            return []
        return self._normalize_plan_payload(alert_id, action_plan.items)["action_items"]

    async def get_action_plan(
        self, db: AsyncSession, alert_id: int
    ) -> dict[str, Any]:
        alert = await self._get_alert(db, alert_id)
        if alert is None:
            raise AlertNotFoundError

        action_plan = await self._get_action_plan(db, alert_id)
        payload = action_plan.items if action_plan else None
        return self._normalize_plan_payload(alert_id, payload)

    async def update_action_plan(
        self, db: AsyncSession, alert_id: int, update_data: dict[str, Any]
    ) -> dict[str, Any]:
        alert = await self._get_alert(db, alert_id)
        if alert is None:
            raise AlertNotFoundError

        action_plan = await self._get_action_plan(db, alert_id)
        payload = self._normalize_plan_payload(alert_id, action_plan.items if action_plan else None)

        for key in ("workflow_status", "risk_report", "ceo_approval", "issued_plan"):
            if update_data.get(key) is not None:
                payload[key] = update_data[key]
        if update_data.get("action_items") is not None:
            payload["action_items"] = update_data["action_items"]

        if action_plan is None:
            action_plan = ActionPlan(alert_id=alert_id, items=payload)
            db.add(action_plan)
        else:
            action_plan.items = payload

        await db.commit()
        return payload

    async def save_action_plan_items(
        self, db: AsyncSession, alert_id: int, items: list[dict[str, Any]]
    ) -> int:
        alert = await self._get_alert(db, alert_id)
        if alert is None:
            raise AlertNotFoundError

        action_plan = await self._get_action_plan(db, alert_id)
        payload = self._normalize_plan_payload(alert_id, action_plan.items if action_plan else None)
        payload["action_items"] = items
        if action_plan is None:
            action_plan = ActionPlan(alert_id=alert_id, items=payload)
            db.add(action_plan)
        else:
            action_plan.items = payload

        await db.commit()
        return len(items)

    async def finalize_action_plan(
        self, db: AsyncSession, alert_id: int
    ) -> dict[str, Any]:
        alert = await self._get_alert(db, alert_id)
        if alert is None:
            raise AlertNotFoundError

        action_plan = await self._get_action_plan(db, alert_id)
        if action_plan is None:
            raise EmptyActionPlanError

        payload = self._normalize_plan_payload(alert_id, action_plan.items)
        if not payload["action_items"]:
            raise EmptyActionPlanError

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

        action_plan.items = payload
        alert.status = "finalized"
        await db.commit()

        return {
            "alert_code": alert.code,
            "alert_title": alert.title,
            "alert_severity": alert.severity,
            "finalized_at": finalized_at,
            "action_plan_items": payload["action_items"],
            "workflow_status": payload["workflow_status"],
            "risk_report": payload["risk_report"],
            "ceo_approval": payload["ceo_approval"],
            "issued_plan": payload["issued_plan"],
        }

    async def generate_recommendations(self, prompt: str) -> list[str]:
        try:
            client = get_gemini_client()
            response = await client.aio.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=prompt,
            )
            return self._parse_recommendations(response.text or "")
        except Exception as exc:
            logger.error("Failed to generate LLM recommendations: %s", exc)
            return self._LLM_FALLBACK_RECOMMENDATIONS

    async def _get_alert(
        self, db: AsyncSession, alert_id: int
    ) -> ComplianceAlert | None:
        result = await db.execute(select(ComplianceAlert).where(ComplianceAlert.id == alert_id))
        return result.scalar_one_or_none()

    async def _get_action_plan(
        self, db: AsyncSession, alert_id: int
    ) -> ActionPlan | None:
        result = await db.execute(select(ActionPlan).where(ActionPlan.alert_id == alert_id))
        return result.scalar_one_or_none()

    def _normalize_plan_payload(self, alert_id: int, payload: Any) -> dict[str, Any]:
        if isinstance(payload, list):
            action_items = payload
            raw = {}
        elif isinstance(payload, dict):
            raw = payload
            action_items = raw.get("action_items")
            if action_items is None:
                action_items = raw.get("items", [])
        else:
            raw = {}
            action_items = []

        return {
            "alert_id": alert_id,
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
            "action_items": self._normalize_action_items(alert_id, action_items),
        }

    @staticmethod
    def _normalize_action_items(alert_id: int, items: Any) -> list[dict[str, Any]]:
        if not isinstance(items, list):
            return []

        normalized = []
        for idx, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                continue
            normalized.append({
                "id": item.get("id") or idx,
                "alert_id": item.get("alert_id") or alert_id,
                "action_description": item.get("action_description") or "",
                "responsible_department": item.get("responsible_department") or "",
                "target_date": item.get("target_date") or "",
                "estimated_budget": item.get("estimated_budget") or 0,
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

    def _serialize_alert(self, alert: ComplianceAlert) -> dict[str, Any]:
        return {
            "id": alert.id,
            "alert_code": alert.code or "",
            "severity": self._derive_severity(alert),
            "title": alert.title,
            "description": alert.summary or "",
            "issued_date": alert.created_at.strftime("%Y-%m-%d") if alert.created_at else "",
            "due_date": alert.deadline or "",
            "estimated_impact": self._extract_estimated_impact(alert),
            "created_at": alert.created_at.isoformat() if alert.created_at else "",
        }

    def _extract_estimated_impact(self, alert: ComplianceAlert) -> str:
        if isinstance(alert.business_impacts, dict):
            return alert.business_impacts.get("estimated_impact", "N/A")
        if isinstance(alert.business_impacts, list) and alert.business_impacts:
            if isinstance(alert.overall_risk, dict):
                return alert.overall_risk.get("label", "N/A")
        return "N/A"

    def _derive_severity(self, alert: ComplianceAlert) -> str:
        raw_severity = str(alert.severity or "").strip()
        if raw_severity and raw_severity.lower() not in self._NON_SEVERITY_STATUSES:
            return self._normalize_severity(raw_severity)

        for source in (alert.overall_risk, alert.risk_scores):
            if isinstance(source, dict):
                for key in self._RISK_KEYS:
                    if source.get(key):
                        return self._normalize_severity(source.get(key))

        if isinstance(alert.risk_scores, dict):
            score = alert.risk_scores.get("score") or alert.risk_scores.get("total_score")
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

    @staticmethod
    def _parse_recommendations(text: str) -> list[str]:
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        recommendations = []
        for line in lines:
            cleaned = line.lstrip("*-0123456789. ")
            if cleaned:
                recommendations.append(cleaned)
        return recommendations or ([text] if text else [])


action_plan_service = ActionPlanService()
