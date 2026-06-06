from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import REPORT_ROLES, get_db, require_roles
from app.models.user import User
from app.schemas.report import (
    AnalysesUpsertRequest,

    ReportItemsSaveResponse,
    ReportItemsUpdate,
    ReportItemResponse,
    ReportResponse,
    ReportUpdate,
    AnalysesResponse,
    FinalizedReportResponse,
    ActionPlanResponse,

    RecommendationRequest,
    RecommendationResponse,
)
from app.services.report import (
    AnalysesNotFoundError,
    EmptyReportError,
    IncompleteReportError,
    ReportLockedError,
    report_service,
)


router = APIRouter(prefix="/report", tags=["report"])


# ────────────────────────────────────────────────────────────────────────────────
# Analyses
# ────────────────────────────────────────────────────────────────────────────────

@router.get("/analyses", response_model=list[AnalysesResponse])
async def list_analyses(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
) -> list[AnalysesResponse]:
    """
    List all compliance analyses.
    """
    return await report_service.list_analyses(db)


@router.post("/analyses", response_model=AnalysesResponse)
async def upsert_analyses(
    request: AnalysesUpsertRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
) -> AnalysesResponse:
    """
    Receive an analyses alert from the Analysis pipeline and expose it in Report.
    """
    return await report_service.upsert_analyses(
        db,
        request.model_dump(exclude_unset=True),
    )


@router.post("/alerts", response_model=AnalysesResponse)
async def upsert_analyses_alert(
    request: AnalysesUpsertRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
) -> AnalysesResponse:
    """
    Backward-compatible alias for Analysis flows that still send an alert payload.
    """
    return await report_service.upsert_analyses(
        db,
        request.model_dump(exclude_unset=True),
    )


# ────────────────────────────────────────────────────────────────────────────────
# Report Items
# ────────────────────────────────────────────────────────────────────────────────

@router.get("/analyses/{analyses_id}/items", response_model=list[ReportItemResponse])
async def get_report_items(
    analyses_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
) -> list[ReportItemResponse]:
    """
    Get report items for a specific analyses.
    """
    return await report_service.get_report_items(db, analyses_id)


@router.post("/analyses/{analyses_id}/items", response_model=ReportItemsSaveResponse)
async def save_report_items(
    analyses_id: int,
    request: ReportItemsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
) -> ReportItemsSaveResponse:
    """
    Save/update report items for a specific analyses.
    """
    try:
        count = await report_service.save_report_items(db, analyses_id, request.items)
    except AnalysesNotFoundError:
        raise HTTPException(status_code=404, detail="Compliance analyses not found")
    except ReportLockedError:
        raise HTTPException(status_code=409, detail="Report is finalized and cannot be edited")
    return {
        "message": "Report items saved successfully",
        "count": count,
    }


@router.get("/analyses/{analyses_id}/report", response_model=ReportResponse)
async def get_report(
    analyses_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
) -> ReportResponse:
    """
    Get the full Report dossier for an analyses.
    """
    try:
        return await report_service.get_report(db, analyses_id)
    except AnalysesNotFoundError:
        raise HTTPException(status_code=404, detail="Compliance analyses not found")


@router.patch("/analyses/{analyses_id}/report", response_model=ReportResponse)
async def update_report(
    analyses_id: int,
    request: ReportUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
) -> ReportResponse:
    """
    Update risk report, CEO approval, issued-plan metadata, workflow, or action items.
    """
    try:
        return await report_service.update_report(
            db,
            analyses_id,
            request.model_dump(exclude_unset=True),
        )
    except AnalysesNotFoundError:
        raise HTTPException(status_code=404, detail="Compliance analyses not found")
    except ReportLockedError:
        raise HTTPException(status_code=409, detail="Report is finalized and cannot be edited")


@router.post("/analyses/{analyses_id}/finalize", response_model=FinalizedReportResponse)

async def finalize_report(
    analyses_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
) -> FinalizedReportResponse:
    """
    Finalize (lock) an report for a specific analyses.
    Returns the JSON representation of the finalized report.
    """
    try:
        return await report_service.finalize_report(db, analyses_id)
    except AnalysesNotFoundError:
        raise HTTPException(status_code=404, detail="Compliance analyses not found")
    except EmptyReportError:
        raise HTTPException(status_code=400, detail="Report is empty. Please add items before finalizing.")
    except IncompleteReportError:
        raise HTTPException(status_code=400, detail="Please fill all required report fields before finalizing.")
    except ReportLockedError:
        raise HTTPException(status_code=409, detail="Report is already finalized.")


# ────────────────────────────────────────────────────────────────────────────────
# LLM Recommendations
# ────────────────────────────────────────────────────────────────────────────────

@router.post("/analyses/{analyses_id}/recommendations", response_model=RecommendationResponse)
async def generate_llm_recommendations(
    analyses_id: int,
    request: RecommendationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
) -> RecommendationResponse:
    """
    Generate LLM recommendations using Gemini based on analyses and user prompt.
    """
    recommendations = await report_service.generate_recommendations(request.prompt)
    return {"recommendations": recommendations}
