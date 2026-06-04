from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.chat import ChatRequest, ChatResponse

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("/message", response_model=ChatResponse)
async def send_message(
    body: ChatRequest,
    _: User = Depends(get_current_user),
) -> ChatResponse:
    # TODO: Implement RAG pipeline
    # 1. Embed body.message with Gemini text-embedding
    # 2. Retrieve top-k chunks from Qdrant
    # 3. Traverse Neo4j for related clauses
    # 4. Call Gemini generate_content with context + message
    return ChatResponse(reply="What's up bro?")
