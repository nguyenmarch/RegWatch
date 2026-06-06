from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.schemas.actionplan import (
    ActionPlanItemsSaveResponse,
    ActionPlanItemsUpdate,
    ActionPlanItemResponse,
    ActionPlanResponse,
    ActionPlanUpdate,
    AlertResponse,
    FinalizedActionPlanResponse,
    RecommendationRequest,
    RecommendationResponse,
)
from app.services.actionplan import (
    AlertNotFoundError,
    EmptyActionPlanError,
    action_plan_service,
)

router = APIRouter(prefix="/actionplan", tags=["actionplan"])


# ────────────────────────────────────────────────────────────────────────────────
# Alerts
# ────────────────────────────────────────────────────────────────────────────────

@router.get("/alerts", response_model=list[AlertResponse])
async def list_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AlertResponse]:
    """
    List all compliance alerts.
    """
    return await action_plan_service.list_alerts(db)


# ────────────────────────────────────────────────────────────────────────────────
# Action Plan Items
# ────────────────────────────────────────────────────────────────────────────────

@router.get("/alerts/{alert_id}/items", response_model=list[ActionPlanItemResponse])
async def get_action_plan_items(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ActionPlanItemResponse]:
    """
    Get action plan items for a specific alert.
    """
    return await action_plan_service.get_action_plan_items(db, alert_id)


@router.post("/alerts/{alert_id}/items", response_model=ActionPlanItemsSaveResponse)
async def save_action_plan_items(
    alert_id: int,
    request: ActionPlanItemsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ActionPlanItemsSaveResponse:
    """
    Save/update action plan items for a specific alert.
    """
    try:
        count = await action_plan_service.save_action_plan_items(db, alert_id, request.items)
    except AlertNotFoundError:
        raise HTTPException(status_code=404, detail="Compliance alert not found")
    return {
        "message": "Action plan items saved successfully",
        "count": count,
    }


@router.get("/alerts/{alert_id}/plan", response_model=ActionPlanResponse)
async def get_action_plan(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ActionPlanResponse:
    """
    Get the full Action Plan dossier for an alert.
    """
    try:
        return await action_plan_service.get_action_plan(db, alert_id)
    except AlertNotFoundError:
        raise HTTPException(status_code=404, detail="Compliance alert not found")


@router.patch("/alerts/{alert_id}/plan", response_model=ActionPlanResponse)
async def update_action_plan(
    alert_id: int,
    request: ActionPlanUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ActionPlanResponse:
    """
    Update risk report, CEO approval, issued-plan metadata, workflow, or action items.
    """
    try:
        return await action_plan_service.update_action_plan(
            db,
            alert_id,
            request.model_dump(exclude_unset=True),
        )
    except AlertNotFoundError:
        raise HTTPException(status_code=404, detail="Compliance alert not found")


@router.post("/alerts/{alert_id}/finalize", response_model=FinalizedActionPlanResponse)
async def finalize_action_plan(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FinalizedActionPlanResponse:
    """
    Finalize (lock) an action plan for a specific alert.
    Returns the JSON representation of the finalized action plan.
    """
    try:
        return await action_plan_service.finalize_action_plan(db, alert_id)
    except AlertNotFoundError:
        raise HTTPException(status_code=404, detail="Compliance alert not found")
    except EmptyActionPlanError:
        raise HTTPException(status_code=400, detail="Action plan is empty. Please add items before finalizing.")


# ────────────────────────────────────────────────────────────────────────────────
# LLM Recommendations
# ────────────────────────────────────────────────────────────────────────────────

@router.post("/alerts/{alert_id}/recommendations", response_model=RecommendationResponse)
async def generate_llm_recommendations(
    alert_id: int,
    request: RecommendationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RecommendationResponse:
    """
    Generate LLM recommendations using Gemini based on alert and user prompt.
    """
    recommendations = await action_plan_service.generate_recommendations(request.prompt)
    return {"recommendations": recommendations}
