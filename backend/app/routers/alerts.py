from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.alert import AlertDetail, AlertSummary
from app.services.alert_service import alert_service

router = APIRouter(prefix="/v1/alerts", tags=["Alerts"])


@router.get("", response_model=list[AlertSummary])
async def list_alerts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[AlertSummary]:
    return await alert_service.list_alerts(db)


@router.get("/pending")
async def pending_jobs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Số tài liệu đang chờ sinh cảnh báo (vd. do trước đó hết quota Gemini)."""
    return {"pending": await alert_service.count_pending_jobs(db)}


@router.get("/{alert_id}", response_model=AlertDetail)
async def get_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AlertDetail:
    alert = await alert_service.get_alert(db, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    deleted = await alert_service.delete_alert(db, alert_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Alert not found")
