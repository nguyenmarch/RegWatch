import asyncio
import logging
from datetime import datetime, timedelta, timezone

from google.genai import types
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.gemini_client import GeminiQuotaExceeded, agenerate_analysis_json
from app.graph.nodes import fetch_graph_context
from app.models.analysis import ComplianceAnalysis
from app.models.analysis_job import AnalysisJob
from app.models.document import Document
from app.schemas.analysis import AnalysisContent, AnalysisGenerationResult, AnalysisUpdate
from app.services.qdrant_service import fetch_doc_chunks, search_conflicts

logger = logging.getLogger(__name__)

# Thresholds/limits for the clause-vs-knowledge-base comparison step.
_SCORE_THRESHOLD = 0.7        # minimum vector similarity to qualify as a candidate
_CANDIDATES_PER_CLAUSE = 3    # KB clauses matched per new clause
_MAX_COMPARE_BLOCKS = 12      # maximum comparison blocks fed into the prompt
_QUOTA_RETRY_DELAY = timedelta(minutes=30)  # defer job when Gemini quota is exhausted

# Severity is derived from a SINGLE risk score overall_risk.value (0–100), not chosen by the LLM.
_URGENT_MIN = 75
_REVIEW_MIN = 45


def _clamp_score(value: int) -> int:
    return max(0, min(100, int(value)))


def _severity_from_value(value: int) -> str:
    """Map a 0–100 risk score → severity using fixed thresholds (75 / 45)."""
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
    "phân tích riêng. Nếu một điều khoản mới mâu thuẫn với nhiều điều khoản trong kho, "
    "hãy tạo NHIỀU phân tích. Với mỗi phân tích: compare_left là điều khoản trong kho, "
    "compare_right là điều khoản của văn bản mới (hoặc ngược lại cho rõ nghĩa), trích "
    "dẫn nguyên văn cụ thể, phân tích tác động nghiệp vụ. Trả lời HOÀN TOÀN bằng "
    "tiếng Việt. Chỉ dựa trên ngữ cảnh được cung cấp; nếu không cặp nào thực sự xung "
    "đột/chồng chéo, trả về danh sách analyses rỗng.\n\n"
    "CHẤM ĐIỂM RỦI RO — overall_risk.value là SỐ NGUYÊN 0–100, chấm dựa trên 3 yếu tố:\n"
    "1) Loại mâu thuẫn: xung đột trực tiếp (cấm vs bắt buộc) cao nhất; chồng chéo/"
    "trùng lặp trung bình; khác biệt nhỏ thấp.\n"
    "2) Phạm vi ảnh hưởng: càng nhiều phòng ban/nghiệp vụ bị tác động, điểm càng cao.\n"
    "3) Mức chế tài pháp lý: hậu quả khi vi phạm càng nặng (phạt nặng, thu hồi giấy "
    "phép...) điểm càng cao.\n"
    "Thang điểm nghiêm trọng: 80–100 = xung đột trực tiếp + ảnh hưởng rộng + chế tài nặng; "
    "45–79 = chồng chéo/trùng lặp, ảnh hưởng vừa; 0–44 = khác biệt nhỏ, chỉ theo dõi. "
    "overall_risk.label mô tả ngắn mức rủi ro tương ứng điểm. KHÔNG tự gán mức độ "
    "khẩn cấp — hệ thống tự suy ra từ overall_risk.value."
    "chỉ số phần trăm rủi ro phải tính toán dựa trên overall_r với công thức (phần trăm rủi ro) = (điểm nghiêm trọng x điểm xác suất / 75) x 15%"
)


# ── Gemini response schema (snake_case, matches AnalysisContent BaseModel) ──────

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

_ANALYSIS_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        "analyses": types.Schema(
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
                                "level": _str(["Cao", "Trung bình", "Thấp"]),
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
    required=["analyses"],
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _build_comparison_context(
    document_id: int, title_map: dict[int, str]
) -> tuple[str, str, int]:
    """Compare each document clause against the KB — using stored vectors.

    Returns (comparison_context, full_text, candidate_count). No embedding call.
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
        "để phát hiện xung đột/chồng chéo; mỗi phát hiện tạo MỘT phân tích.",
        "",
        "=== ĐỐI CHIẾU ĐIỀU KHOẢN (Qdrant semantic match) ===",
        comparison_ctx,
    ]
    if graph_ctx:
        parts.append(
            "\n=== NGỮ CẢNH QUAN HỆ ĐIỀU KHOẢN (Neo4j) ===\n" + graph_ctx
        )
    return "\n".join(parts)


class AnalysisService:

    async def list_analyses(self, db: AsyncSession) -> list[ComplianceAnalysis]:
        result = await db.execute(
            select(ComplianceAnalysis).order_by(ComplianceAnalysis.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_analysis(self, db: AsyncSession, analysis_id: int) -> ComplianceAnalysis | None:
        result = await db.execute(
            select(ComplianceAnalysis).where(ComplianceAnalysis.id == analysis_id)
        )
        return result.scalar_one_or_none()

    async def delete_analysis(self, db: AsyncSession, analysis_id: int) -> bool:
        analysis = await self.get_analysis(db, analysis_id)
        if analysis is None:
            return False
        await db.execute(
            delete(ComplianceAnalysis).where(ComplianceAnalysis.id == analysis_id)
        )
        await db.commit()
        return True

    async def _next_code_seq(self, db: AsyncSession, document_id: int) -> int:
        total = await db.scalar(
            select(func.count())
            .select_from(ComplianceAnalysis)
            .where(ComplianceAnalysis.document_id == document_id)
        )
        return int(total or 0) + 1

    async def _doc_title_map(self, db: AsyncSession) -> dict[int, str]:
        result = await db.execute(select(Document.id, Document.title))
        return {row.id: row.title for row in result.all()}

    async def count_pending_jobs(self, db: AsyncSession) -> int:
        """Number of documents awaiting analysis generation (e.g. previously hit quota)."""
        total = await db.scalar(
            select(func.count())
            .select_from(AnalysisJob)
            .where(AnalysisJob.status == "pending")
        )
        return int(total or 0)

    async def _get_or_create_job(
        self, db: AsyncSession, document_id: int
    ) -> AnalysisJob:
        job = await db.scalar(
            select(AnalysisJob).where(AnalysisJob.document_id == document_id)
        )
        if job is None:
            job = AnalysisJob(document_id=document_id, status="pending", attempts=0)
            db.add(job)
            await db.commit()
            await db.refresh(job)
        return job

    async def _mark_job(
        self,
        db: AsyncSession,
        job: AnalysisJob,
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
        """Compare a document against the KB → generate analysis → persist to DB (quota-durable).

        Compares EACH document clause against the rest of the KB (Qdrant,
        excluding itself) + expands clause relations (Neo4j), then calls Gemini
        (dedicated key) to list all conflicts/overlaps. Uses stored vectors so the
        retrieval step makes NO embedding call.

        State tracked via AnalysisJob: quota exhausted (429) → keep 'pending' and set
        next_retry_at for the scheduler to retry; other errors → 'failed'.
        """
        from app.core.db import async_session_factory

        async with async_session_factory() as db:
            doc = await db.scalar(
                select(Document).where(Document.id == document_id)
            )
            if doc is None:
                logger.warning("[Analysis] Document %s does not exist.", document_id)
                return
            if doc.status != "completed":
                logger.warning(
                    "[Analysis] Document %s not completed (status=%s) — skipping.",
                    document_id, doc.status,
                )
                return

            job = await self._get_or_create_job(db, document_id)
            if job.status == "completed":
                return  # already generated — do not repeat (idempotent)

            title_map = await self._doc_title_map(db)
            comparison_ctx, full_text, candidate_count = await asyncio.to_thread(
                _build_comparison_context, document_id, title_map
            )

            if candidate_count == 0:
                await self._mark_job(db, job, "completed")
                logger.info(
                    "[Analysis] No similar clauses in the KB for document "
                    "%s — marking complete (0 analyses).", document_id,
                )
                return

            graph_ctx = await fetch_graph_context(full_text)
            prompt = _build_prompt(doc.title, comparison_ctx, graph_ctx)

            try:
                raw = await agenerate_analysis_json(
                    prompt, _SYSTEM_INSTRUCTION, _ANALYSIS_SCHEMA
                )
                parsed = AnalysisGenerationResult.model_validate(raw)
            except GeminiQuotaExceeded as exc:
                retry_at = datetime.utcnow() + _QUOTA_RETRY_DELAY
                await self._mark_job(
                    db, job, "pending",
                    error=str(exc)[:500], next_retry_at=retry_at, bump=True,
                )
                logger.warning(
                    "[Analysis] Gemini quota exhausted for document %s — will retry at %s.",
                    document_id, retry_at.isoformat(),
                )
                return
            except Exception as exc:
                await self._mark_job(
                    db, job, "failed", error=str(exc)[:500], bump=True
                )
                logger.exception(
                    "[Analysis] Analysis generation failed for document %s", document_id
                )
                return

            if parsed.analyses:
                seq = await self._next_code_seq(db, document_id)
                for offset, content in enumerate(parsed.analyses):
                    row = self._to_row(content, document_id, code_seq=seq + offset)
                    db.add(row)
                await db.commit()

            await self._mark_job(db, job, "completed")
            logger.info(
                "[Analysis] Generated %d analyses for document %s (compared %d candidates)",
                len(parsed.analyses), document_id, candidate_count,
            )

    @staticmethod
    def _to_row(content: AnalysisContent, document_id: int, code_seq: int) -> ComplianceAnalysis:
        score = _clamp_score(content.overall_risk.value)
        overall = {**content.overall_risk.model_dump(), "value": score}
        return ComplianceAnalysis(
            code=f"D{document_id}-{code_seq:03d}",
            document_id=document_id,
            title=content.title,
            summary=content.summary,
            conflict_headline=content.conflict_headline,
            severity=_severity_from_value(score),
            deadline=content.deadline,
            status="pending",
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


    async def update_analysis(
        self, db: AsyncSession, analysis_id: int, data: AnalysisUpdate
    ) -> ComplianceAnalysis | None:
        """Update analysis content (inline editing from the frontend)."""
        analysis = await self.get_analysis(db, analysis_id)
        if analysis is None:
            return None

        field_map = {
            "title": data.title,
            "summary": data.summary,
            "conflict_headline": data.conflict_headline,
            "deadline": data.deadline,
            "conflict_note": data.conflict_note,
            "risk_conclusion": data.risk_conclusion,
        }
        for field, value in field_map.items():
            if value is not None:
                setattr(analysis, field, value)

        if data.overall_risk is not None:
            analysis.overall_risk = data.overall_risk.model_dump()
        if data.compare_left is not None:
            analysis.compare_left = data.compare_left.model_dump()
        if data.compare_right is not None:
            analysis.compare_right = data.compare_right.model_dump()
        if data.business_impacts is not None:
            analysis.business_impacts = [b.model_dump() for b in data.business_impacts]
        if data.risk_scores is not None:
            analysis.risk_scores = [r.model_dump() for r in data.risk_scores]
        if data.detail_tables is not None:
            analysis.detail_tables = [t.model_dump() for t in data.detail_tables]

        await db.commit()
        await db.refresh(analysis)
        return analysis

    async def publish_analysis(
        self, db: AsyncSession, analysis_id: int
    ) -> ComplianceAnalysis | None:
        """Mark the analysis as processed (status = processed)."""
        analysis = await self.get_analysis(db, analysis_id)
        if analysis is None:
            return None
        analysis.status = "processed"
        await db.commit()
        await db.refresh(analysis)
        return analysis


analysis_service = AnalysisService()
