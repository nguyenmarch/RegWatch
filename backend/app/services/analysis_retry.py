import asyncio
import logging
from datetime import datetime

from sqlalchemy import or_, select

from app.models.analysis_job import AnalysisJob

logger = logging.getLogger(__name__)

_INTERVAL_SECONDS = 900   # scan every 15 minutes
_BATCH = 5                # jobs processed per cycle (stay within quota limits)


async def _due_pending_jobs(db, now: datetime) -> list[AnalysisJob]:
    result = await db.execute(
        select(AnalysisJob)
        .where(
            AnalysisJob.status == "pending",
            or_(AnalysisJob.next_retry_at.is_(None), AnalysisJob.next_retry_at <= now),
        )
        .order_by(AnalysisJob.updated_at)
        .limit(_BATCH)
    )
    return list(result.scalars().all())


async def _run_once() -> None:
    from app.core.db import async_session_factory
    from app.services.analysis_service import analysis_service

    async with async_session_factory() as db:
        jobs = await _due_pending_jobs(db, datetime.utcnow())

    for job in jobs:
        logger.info(
            "[AnalysisRetry] Retrying analysis generation for document %s (attempt %d).",
            job.document_id, (job.attempts or 0) + 1,
        )
        await analysis_service.generate_for_document(job.document_id)


async def analysis_retry_loop() -> None:
    """Background loop: periodically retry 'pending' jobs (e.g. previously hit Gemini quota)."""
    logger.info("[AnalysisRetry] Scheduler started (every %ds).", _INTERVAL_SECONDS)
    while True:
        try:
            await asyncio.sleep(_INTERVAL_SECONDS)
            await _run_once()
        except asyncio.CancelledError:
            logger.info("[AnalysisRetry] Scheduler stopped.")
            raise
        except Exception:
            logger.exception("[AnalysisRetry] Error in retry loop — skipping this cycle.")
