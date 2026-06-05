import asyncio
import logging
from datetime import datetime, timedelta, timezone

from google.genai import types
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.gemini_client import GeminiQuotaExceeded, agenerate_alert_json
from app.graph.nodes import fetch_graph_context
from app.models.alert import ComplianceAlert
from app.models.alert_job import AlertJob
from app.models.document import Document
from app.schemas.alert import AlertContent, AlertGenerationResult
from app.services.qdrant_service import fetch_doc_chunks, search_conflicts

logger = logging.getLogger(__name__)

# Ngưỡng/giới hạn cho bước đối chiếu điều khoản với kho tri thức.
_SCORE_THRESHOLD = 0.7        # vector similarity tối thiểu để coi là ứng viên
_CANDIDATES_PER_CLAUSE = 3    # số điều khoản trong kho khớp với mỗi điều khoản mới
_MAX_COMPARE_BLOCKS = 12      # số khối đối chiếu tối đa đưa vào prompt
_QUOTA_RETRY_DELAY = timedelta(minutes=30)  # hoãn job khi hết quota Gemini

# Severity suy ra từ MỘT điểm rủi ro overall_risk.value (0–100), không do LLM chọn.
_URGENT_MIN = 75
_REVIEW_MIN = 45


def _clamp_score(value: int) -> int:
    return max(0, min(100, int(value)))


def _severity_from_value(value: int) -> str:
    """Map điểm rủi ro 0–100 → severity theo ngưỡng cố định (75 / 45)."""
    v = _clamp_score(value)
    if v >= _URGENT_MIN:
        return "urgent"
    if v >= _REVIEW_MIN:
        return "review"
    return "monitor"

_SYSTEM_INSTRUCTION = (
    "Bạn là chuyên gia tuân thủ pháp lý ngân hàng Việt Nam (Compliance Officer). "
    "Nhiệm vụ: đối chiếu TỪNG điều khoản của văn bản pháp lý mới với các điều khoản "
    "TƯƠNG ĐỒNG tìm được trong kho tri thức (các tài liệu khác) để phát hiện XUNG ĐỘT "
    "(mâu thuẫn) và CHỒNG CHÉO. MỖI cặp đối chiếu có xung đột/chồng chéo phải tạo MỘT "
    "cảnh báo riêng. Nếu một điều khoản mới mâu thuẫn với nhiều điều khoản trong kho, "
    "hãy tạo NHIỀU cảnh báo. Với mỗi cảnh báo: compare_left là điều khoản trong kho, "
    "compare_right là điều khoản của văn bản mới (hoặc ngược lại cho rõ nghĩa), trích "
    "dẫn nguyên văn cụ thể, phân tích tác động nghiệp vụ. Trả lời HOÀN TOÀN bằng "
    "tiếng Việt. Chỉ dựa trên ngữ cảnh được cung cấp; nếu không cặp nào thực sự xung "
    "đột/chồng chéo, trả về danh sách alerts rỗng.\n\n"
    "CHẤM ĐIỂM RỦI RO — overall_risk.value là SỐ NGUYÊN 0–100, chấm dựa trên 3 yếu tố:\n"
    "1) Loại mâu thuẫn: xung đột trực tiếp (cấm vs bắt buộc) cao nhất; chồng chéo/"
    "trùng lặp trung bình; khác biệt nhỏ thấp.\n"
    "2) Phạm vi ảnh hưởng: càng nhiều phòng ban/nghiệp vụ bị tác động, điểm càng cao.\n"
    "3) Mức chế tài pháp lý: hậu quả khi vi phạm càng nặng (phạt nặng, thu hồi giấy "
    "phép...) điểm càng cao.\n"
    "Thang điểm: 80–100 = xung đột trực tiếp + ảnh hưởng rộng + chế tài nặng; "
    "45–79 = chồng chéo/trùng lặp, ảnh hưởng vừa; 0–44 = khác biệt nhỏ, chỉ theo dõi. "
    "overall_risk.label mô tả ngắn mức rủi ro tương ứng điểm. KHÔNG tự gán mức độ "
    "khẩn cấp — hệ thống tự suy ra từ overall_risk.value."
)


# ── Gemini response schema (snake_case, khớp AlertContent BaseModel) ─────────

def _str(enum: list[str] | None = None) -> types.Schema:
    return types.Schema(type=types.Type.STRING, enum=enum)


_COMPARE_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        "source": _str(),
        "verdict": _str(),
        "quote": _str(),
        "tone": _str(["danger", "safe"]),
    },
    required=["source", "verdict", "quote", "tone"],
)

_OVERALL_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={"value": types.Schema(type=types.Type.INTEGER), "label": _str()},
    required=["value", "label"],
)

_ALERT_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        "alerts": types.Schema(
            type=types.Type.ARRAY,
            items=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "title": _str(),
                    "summary": _str(),
                    "conflict_headline": _str(),
                    "deadline": _str(),
                    "overall_risk": _OVERALL_SCHEMA,
                    "compare_left": _COMPARE_SCHEMA,
                    "compare_right": _COMPARE_SCHEMA,
                    "conflict_note": _str(),
                    "business_impacts": types.Schema(
                        type=types.Type.ARRAY,
                        items=types.Schema(
                            type=types.Type.OBJECT,
                            properties={
                                "area": _str(),
                                "detail": _str(),
                                "risk": _str(["urgent", "review", "monitor"]),
                            },
                            required=["area", "detail", "risk"],
                        ),
                    ),
                    "risk_scores": types.Schema(
                        type=types.Type.ARRAY,
                        items=types.Schema(
                            type=types.Type.OBJECT,
                            properties={
                                "label": _str(),
                                "value": types.Schema(type=types.Type.INTEGER),
                                "level": _str(),
                            },
                            required=["label", "value", "level"],
                        ),
                    ),
                    "risk_conclusion": _str(),
                    "detail_tables": types.Schema(
                        type=types.Type.ARRAY,
                        items=types.Schema(
                            type=types.Type.OBJECT,
                            properties={
                                "title": _str(),
                                "headers": types.Schema(
                                    type=types.Type.ARRAY, items=_str()
                                ),
                                "rows": types.Schema(
                                    type=types.Type.ARRAY,
                                    items=types.Schema(
                                        type=types.Type.OBJECT,
                                        properties={
                                            "col1": _str(),
                                            "col2": _str(),
                                            "col3": _str(),
                                            "status": _str(
                                                ["violation", "compliant", "risk",
                                                 "missing", "neutral"]
                                            ),
                                        },
                                        required=["col1", "col2", "col3", "status"],
                                    ),
                                ),
                            },
                            required=["title", "headers", "rows"],
                        ),
                    ),
                },
                required=[
                    "title", "summary", "conflict_headline",
                    "overall_risk", "compare_left", "compare_right", "conflict_note",
                    "business_impacts", "risk_scores", "risk_conclusion", "detail_tables",
                ],
            ),
        ),
    },
    required=["alerts"],
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _build_comparison_context(
    document_id: int, title_map: dict[int, str]
) -> tuple[str, str, int]:
    """Đối chiếu từng điều khoản của tài liệu với kho — dùng vector đã lưu.

    Trả về (comparison_context, full_text, candidate_count). Không gọi embedding.
    """
    chunks = fetch_doc_chunks(document_id)
    full_text = "\n".join(c["text"] for c in chunks if c["text"])

    blocks: list[str] = []
    candidate_count = 0
    for chunk in chunks:
        if not chunk["vector"] or not chunk["text"]:
            continue
        candidates = search_conflicts(
            chunk["vector"],
            exclude_document_id=document_id,
            limit=_CANDIDATES_PER_CLAUSE,
            score_threshold=_SCORE_THRESHOLD,
        )
        if not candidates:
            continue
        candidate_count += len(candidates)

        new_label = chunk["header"] or chunk["chunk_id"]
        lines = [
            f"### ĐIỀU KHOẢN MỚI [{new_label}]:\n{chunk['text']}",
            "Điều khoản tương đồng trong kho:",
        ]
        for cand in candidates:
            src = title_map.get(cand["document_id"], f"doc {cand['document_id']}")
            cand_label = cand["header"] or cand["chunk_id"]
            lines.append(
                f"- [{src} / {cand_label} | score {cand['score']}]: {cand['text']}"
            )
        blocks.append("\n".join(lines))
        if len(blocks) >= _MAX_COMPARE_BLOCKS:
            break

    return "\n\n".join(blocks), full_text, candidate_count


def _build_prompt(doc_title: str, comparison_ctx: str, graph_ctx: str) -> str:
    parts = [
        f"VĂN BẢN MỚI CẦN ĐỐI CHIẾU: {doc_title}",
        "",
        "Dưới đây là các điều khoản của văn bản mới, mỗi điều kèm những điều khoản "
        "TƯƠNG ĐỒNG tìm được trong kho tri thức (tài liệu khác). Phân tích từng cặp "
        "để phát hiện xung đột/chồng chéo; mỗi phát hiện tạo MỘT cảnh báo.",
        "",
        "=== ĐỐI CHIẾU ĐIỀU KHOẢN (Qdrant semantic match) ===",
        comparison_ctx,
    ]
    if graph_ctx:
        parts.append(
            "\n=== NGỮ CẢNH QUAN HỆ ĐIỀU KHOẢN (Neo4j) ===\n" + graph_ctx
        )
    return "\n".join(parts)


class AlertService:

    async def list_alerts(self, db: AsyncSession) -> list[ComplianceAlert]:
        result = await db.execute(
            select(ComplianceAlert).order_by(ComplianceAlert.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_alert(self, db: AsyncSession, alert_id: int) -> ComplianceAlert | None:
        result = await db.execute(
            select(ComplianceAlert).where(ComplianceAlert.id == alert_id)
        )
        return result.scalar_one_or_none()

    async def delete_alert(self, db: AsyncSession, alert_id: int) -> bool:
        alert = await self.get_alert(db, alert_id)
        if alert is None:
            return False
        await db.execute(
            delete(ComplianceAlert).where(ComplianceAlert.id == alert_id)
        )
        await db.commit()
        return True

    async def _next_code_seq(self, db: AsyncSession) -> int:
        total = await db.scalar(select(func.count()).select_from(ComplianceAlert))
        return int(total or 0) + 1

    async def _doc_title_map(self, db: AsyncSession) -> dict[int, str]:
        result = await db.execute(select(Document.id, Document.title))
        return {row.id: row.title for row in result.all()}

    async def count_pending_jobs(self, db: AsyncSession) -> int:
        """Số tài liệu đang chờ sinh cảnh báo (vd. do trước đó hết quota)."""
        total = await db.scalar(
            select(func.count())
            .select_from(AlertJob)
            .where(AlertJob.status == "pending")
        )
        return int(total or 0)

    async def _get_or_create_job(
        self, db: AsyncSession, document_id: int
    ) -> AlertJob:
        job = await db.scalar(
            select(AlertJob).where(AlertJob.document_id == document_id)
        )
        if job is None:
            job = AlertJob(document_id=document_id, status="pending", attempts=0)
            db.add(job)
            await db.commit()
            await db.refresh(job)
        return job

    async def _mark_job(
        self,
        db: AsyncSession,
        job: AlertJob,
        status: str,
        *,
        error: str | None = None,
        next_retry_at: datetime | None = None,
        bump: bool = False,
    ) -> None:
        job.status = status
        job.last_error = error
        job.next_retry_at = next_retry_at
        if bump:
            job.attempts = (job.attempts or 0) + 1
        await db.commit()

    async def generate_for_document(self, document_id: int) -> None:
        """Đối chiếu document với kho → sinh cảnh báo → lưu DB (bền bỉ với quota).

        Đối chiếu TỪNG điều khoản của tài liệu với phần còn lại của kho (Qdrant,
        loại trừ chính nó) + mở rộng quan hệ điều khoản (Neo4j), rồi gọi Gemini
        (key riêng) để liệt kê tất cả xung đột/chồng chéo. Dùng vector đã lưu nên
        bước truy hồi KHÔNG phát sinh lời gọi embedding.

        Trạng thái lưu qua AlertJob: hết quota (429) → giữ 'pending' + đặt
        next_retry_at để scheduler tự thử lại; lỗi khác → 'failed'.
        """
        from app.core.db import async_session_factory

        async with async_session_factory() as db:
            doc = await db.scalar(
                select(Document).where(Document.id == document_id)
            )
            if doc is None:
                logger.warning("[Alert] Document %s không tồn tại.", document_id)
                return
            if doc.status != "completed":
                logger.warning(
                    "[Alert] Document %s chưa completed (status=%s) — bỏ qua.",
                    document_id, doc.status,
                )
                return

            job = await self._get_or_create_job(db, document_id)
            if job.status == "completed":
                return  # đã sinh xong trước đó — không lặp lại (idempotent)

            title_map = await self._doc_title_map(db)
            comparison_ctx, full_text, candidate_count = await asyncio.to_thread(
                _build_comparison_context, document_id, title_map
            )

            if candidate_count == 0:
                await self._mark_job(db, job, "completed")
                logger.info(
                    "[Alert] Không có điều khoản tương đồng trong kho cho document "
                    "%s — đánh dấu hoàn tất (0 cảnh báo).", document_id,
                )
                return

            graph_ctx = await fetch_graph_context(full_text)
            prompt = _build_prompt(doc.title, comparison_ctx, graph_ctx)

            try:
                raw = await agenerate_alert_json(
                    prompt, _SYSTEM_INSTRUCTION, _ALERT_SCHEMA
                )
                parsed = AlertGenerationResult.model_validate(raw)
            except GeminiQuotaExceeded as exc:
                retry_at = datetime.utcnow() + _QUOTA_RETRY_DELAY
                await self._mark_job(
                    db, job, "pending",
                    error=str(exc)[:500], next_retry_at=retry_at, bump=True,
                )
                logger.warning(
                    "[Alert] Hết quota Gemini cho document %s — sẽ thử lại lúc %s.",
                    document_id, retry_at.isoformat(),
                )
                return
            except Exception as exc:
                await self._mark_job(
                    db, job, "failed", error=str(exc)[:500], bump=True
                )
                logger.exception(
                    "[Alert] Sinh cảnh báo thất bại cho document %s", document_id
                )
                return

            if parsed.alerts:
                seq = await self._next_code_seq(db)
                for offset, content in enumerate(parsed.alerts):
                    row = self._to_row(content, document_id, code_seq=seq + offset)
                    db.add(row)
                await db.commit()

            await self._mark_job(db, job, "completed")
            logger.info(
                "[Alert] Đã sinh %d cảnh báo cho document %s (đối chiếu %d ứng viên)",
                len(parsed.alerts), document_id, candidate_count,
            )

    @staticmethod
    def _to_row(content: AlertContent, document_id: int, code_seq: int) -> ComplianceAlert:
        score = _clamp_score(content.overall_risk.value)
        overall = {**content.overall_risk.model_dump(), "value": score}
        return ComplianceAlert(
            code=f"VD-{code_seq:03d}",
            document_id=document_id,
            title=content.title,
            summary=content.summary,
            conflict_headline=content.conflict_headline,
            severity=_severity_from_value(score),
            deadline=content.deadline,
            status="completed",
            overall_risk=overall,
            compare_left=content.compare_left.model_dump(),
            compare_right=content.compare_right.model_dump(),
            conflict_note=content.conflict_note,
            business_impacts=[b.model_dump() for b in content.business_impacts],
            risk_scores=[r.model_dump() for r in content.risk_scores],
            risk_conclusion=content.risk_conclusion,
            detail_tables=[t.model_dump() for t in content.detail_tables],
            generated_at=_now(),
        )


alert_service = AlertService()
