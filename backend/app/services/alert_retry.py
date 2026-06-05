import asyncio
import logging
from datetime import datetime

from sqlalchemy import or_, select

from app.models.alert_job import AlertJob

logger = logging.getLogger(__name__)

_INTERVAL_SECONDS = 900   # quét mỗi 15 phút
_BATCH = 5                # số job xử lý mỗi vòng (giữ trong giới hạn quota)


async def _due_pending_jobs(db, now: datetime) -> list[AlertJob]:
    result = await db.execute(
        select(AlertJob)
        .where(
            AlertJob.status == "pending",
            or_(AlertJob.next_retry_at.is_(None), AlertJob.next_retry_at <= now),
        )
        .order_by(AlertJob.updated_at)
        .limit(_BATCH)
    )
    return list(result.scalars().all())


async def _run_once() -> None:
    from app.core.db import async_session_factory
    from app.services.alert_service import alert_service

    async with async_session_factory() as db:
        jobs = await _due_pending_jobs(db, datetime.utcnow())

    for job in jobs:
        logger.info(
            "[AlertRetry] Thử lại sinh cảnh báo cho document %s (lần %d).",
            job.document_id, (job.attempts or 0) + 1,
        )
        await alert_service.generate_for_document(job.document_id)


async def alert_retry_loop() -> None:
    """Vòng lặp nền: định kỳ thử lại job 'pending' (vd. trước đó hết quota Gemini)."""
    logger.info("[AlertRetry] Scheduler khởi động (mỗi %ds).", _INTERVAL_SECONDS)
    while True:
        try:
            await asyncio.sleep(_INTERVAL_SECONDS)
            await _run_once()
        except asyncio.CancelledError:
            logger.info("[AlertRetry] Scheduler dừng.")
            raise
        except Exception:
            logger.exception("[AlertRetry] Lỗi trong vòng lặp retry — bỏ qua vòng này.")
