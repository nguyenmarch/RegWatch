from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.analysis import AnalysisDetail, AnalysisSummary, AnalysisUpdate
from app.services.analysis_service import analysis_service

router = APIRouter(prefix="/v1/analyses", tags=["Analyses"])


@router.get("", response_model=list[AnalysisSummary])
async def list_analysis(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[AnalysisSummary]:
    return await analysis_service.list_analyses(db)


@router.get("/pending")
async def pending_jobs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Number of documents awaiting analysis generation (e.g. previously hit Gemini quota)."""
    return {"pending": await analysis_service.count_pending_jobs(db)}


@router.get("/{analysis_id}", response_model=AnalysisDetail)
async def get_analysis(
    analysis_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnalysisDetail:
    analysis = await analysis_service.get_analysis(db, analysis_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return analysis


@router.patch("/{analysis_id}", response_model=AnalysisDetail)
async def update_analysis(
    analysis_id: int,
    body: AnalysisUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnalysisDetail:
    """Update analysis content (inline editing from the dashboard)."""
    updated = await analysis_service.update_analysis(db, analysis_id, body)
    if updated is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return updated


@router.post("/{analysis_id}/publish", response_model=AnalysisDetail)
async def publish_analysis(
    analysis_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnalysisDetail:
    """Mark the analysis as processed (status = processed) — equivalent to Send JSON."""
    published = await analysis_service.publish_analysis(db, analysis_id)
    if published is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return published


@router.delete("/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_analysis(
    analysis_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    deleted = await analysis_service.delete_analysis(db, analysis_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Analysis not found")
