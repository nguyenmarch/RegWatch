from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.chat import (
    ChatConversationCreate,
    ChatConversationDetail,
    ChatConversationResponse,
    ChatMessageCreate,
    SendMessageResponse,
)
from app.services.chat_service import chat_service

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.get("/conversations", response_model=list[ChatConversationResponse])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ChatConversationResponse]:
    return await chat_service.list_conversations(db, user.id)


@router.post(
    "/conversations",
    response_model=ChatConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_conversation(
    body: ChatConversationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatConversationResponse:
    return await chat_service.create_conversation(db, user.id, body.title)


@router.get("/conversations/{conversation_id}", response_model=ChatConversationDetail)
async def get_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatConversationDetail:
    conversation = await chat_service.get_conversation(db, user.id, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = await chat_service.get_messages(db, conversation_id)
    return ChatConversationDetail.model_validate(
        {**conversation.__dict__, "messages": messages}
    )


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=SendMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    conversation_id: int,
    body: ChatMessageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SendMessageResponse:
    try:
        user_message, assistant_message = await chat_service.send_message(
            db,
            user.id,
            conversation_id,
            body.content,
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return SendMessageResponse(
        user_message=user_message,
        assistant_message=assistant_message,
    )


@router.post(
    "/conversations/{conversation_id}/messages/stream",
    status_code=status.HTTP_200_OK,
)
async def stream_message(
    conversation_id: int,
    body: ChatMessageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    return StreamingResponse(
        chat_service.stream_message(db, user.id, conversation_id, body.content),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    deleted = await chat_service.delete_conversation(db, user.id, conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
