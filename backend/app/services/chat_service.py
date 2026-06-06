import asyncio
import json
from collections.abc import AsyncIterator
from datetime import datetime
import time

from sqlalchemy import delete, desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.gemini_client import agenerate_text_stream
from app.graph.nodes import fetch_graph_context, fetch_vector_context
from app.models.conversation import ChatConversation, ChatMessage
from app.utils.citation_extractor import citation_extractor
from app.services.retrieval_service import retrieval_service

_HISTORY_WINDOW = 20  # last 20 messages = 10 turns
_SYSTEM_INSTRUCTION = (
    "You are a legal compliance assistant specialized in Vietnamese law and regulations. "
    "Answer questions accurately and concisely using only the provided context. "
    "Always cite the specific article numbers (Điều) when referencing legal provisions. "
    "If the context does not contain enough information to answer, say so clearly."
)


def _title_from_message(content: str) -> str:
    title = " ".join(content.strip().split())
    if not title:
        return "New chat"
    return title[:64] + ("..." if len(title) > 64 else "")


def _format_history(messages: list[ChatMessage]) -> list[dict]:
    return [
        {
            "role": "model" if m.role == "assistant" else "user",
            "parts": [{"text": m.content}],
        }
        for m in messages
    ]


def _build_system_with_context(vector_ctx: str, graph_ctx: str) -> str:
    parts = [_SYSTEM_INSTRUCTION]
    if vector_ctx:
        parts.append("=== Semantic Search Results ===\n" + vector_ctx)
    if graph_ctx:
        parts.append("=== Knowledge Graph Context ===\n" + graph_ctx)
    return "\n\n".join(parts)


class ChatService:
    async def list_conversations(self, db: AsyncSession, user_id: int) -> list[ChatConversation]:
        result = await db.execute(
            select(ChatConversation)
            .where(ChatConversation.user_id == user_id)
            .order_by(desc(ChatConversation.updated_at))
        )
        return list(result.scalars().all())

    async def create_conversation(
        self,
        db: AsyncSession,
        user_id: int,
        title: str | None = None,
    ) -> ChatConversation:
        conversation = ChatConversation(user_id=user_id, title=title or "New chat")
        db.add(conversation)
        await db.commit()
        await db.refresh(conversation)
        return conversation

    async def get_conversation(
        self,
        db: AsyncSession,
        user_id: int,
        conversation_id: int,
    ) -> ChatConversation | None:
        result = await db.execute(
            select(ChatConversation).where(
                ChatConversation.id == conversation_id,
                ChatConversation.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_messages(
        self,
        db: AsyncSession,
        conversation_id: int,
    ) -> list[ChatMessage]:
        result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        )
        return list(result.scalars().all())

    async def delete_conversation(
        self,
        db: AsyncSession,
        user_id: int,
        conversation_id: int,
    ) -> bool:
        conversation = await self.get_conversation(db, user_id, conversation_id)
        if conversation is None:
            return False

        await db.execute(delete(ChatMessage).where(ChatMessage.conversation_id == conversation_id))
        await db.execute(delete(ChatConversation).where(ChatConversation.id == conversation_id))
        await db.commit()
        return True

    async def send_message(
        self,
        db: AsyncSession,
        user_id: int,
        conversation_id: int,
        content: str,
    ) -> tuple[ChatMessage, ChatMessage]:
        from app.services.rag_engine import query as rag_query

        conversation = await self.get_conversation(db, user_id, conversation_id)
        if conversation is None:
            raise ValueError("Conversation not found")

        normalized = content.strip()

        # Save user message first
        user_message = ChatMessage(
            conversation_id=conversation_id,
            role="user",
            content=normalized,
        )
        db.add(user_message)
        await db.commit()
        await db.refresh(user_message)

        # Load history (excluding the message just saved) for context window
        all_messages = await self.get_messages(db, conversation_id)
        prior_messages = [m for m in all_messages if m.id != user_message.id]
        history = _format_history(prior_messages[-_HISTORY_WINDOW:])

        # Run RAG pipeline
        result = await rag_query(question=normalized, chat_history=history)
        answer = result.get("final_answer") or "Sorry, I was unable to generate an answer."

        # Save assistant message
        assistant_message = ChatMessage(
            conversation_id=conversation_id,
            role="assistant",
            content=answer,
        )
        db.add(assistant_message)

        # Update conversation title from first user message
        new_title = conversation.title
        if conversation.title == "New chat" and not prior_messages:
            new_title = _title_from_message(normalized)

        await db.execute(
            update(ChatConversation)
            .where(ChatConversation.id == conversation_id)
            .values(title=new_title, updated_at=datetime.utcnow())
        )
        await db.commit()
        await db.refresh(assistant_message)
        return user_message, assistant_message

    async def stream_message(
        self,
        db: AsyncSession,
        user_id: int,
        conversation_id: int,
        content: str,
    ) -> AsyncIterator[str]:
        conversation = await self.get_conversation(db, user_id, conversation_id)
        if conversation is None:
            yield f"data: {json.dumps({'error': 'Conversation not found'})}\n\n"
            return

        normalized = content.strip()

        # Save user message
        user_message = ChatMessage(
            conversation_id=conversation_id,
            role="user",
            content=normalized,
        )
        db.add(user_message)
        await db.commit()
        await db.refresh(user_message)

        # Load history for context
        all_messages = await self.get_messages(db, conversation_id)
        prior_messages = [m for m in all_messages if m.id != user_message.id]
        history = _format_history(prior_messages[-_HISTORY_WINDOW:])

        # Extract citations for better retrieval
        citations, _ = citation_extractor.extract_from_question(normalized)

        # Fetch vector + graph contexts in parallel
        (vector_ctx, vector_hits), (graph_ctx, graph_results) = await asyncio.gather(
            fetch_vector_context(normalized, citations),
            fetch_graph_context(normalized, citations),
        )

        # Hybrid ranking and deduplication
        ranked = await retrieval_service.rank_results(vector_hits, graph_results)
        deduped = await retrieval_service.deduplicate_context(ranked, max_tokens=4000)

        # Build system prompt with ranked context
        context_lines = []
        for result in deduped:
            score_str = f"score:{result.total_score:.3f}"
            header = f"[{result.chunk_type} | {score_str}]"
            context_lines.append(f"{header}\n{result.text}")

        context_block = "\n\n---\n\n".join(context_lines) if context_lines else "No context available."
        system = _SYSTEM_INSTRUCTION + "\n\nContext (ranked by relevance):\n" + context_block

        # Stream generation
        full_response = ""
        try:
            async for token in agenerate_text_stream(
                question=normalized,
                system_instruction=system,
                history=history,
            ):
                full_response += token
                yield f"data: {json.dumps({'token': token})}\n\n"
        except Exception as exc:
            error_msg = "Sorry, an error occurred during generation."
            full_response = full_response or error_msg
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

        # Save assistant message
        assistant_message = ChatMessage(
            conversation_id=conversation_id,
            role="assistant",
            content=full_response,
        )
        db.add(assistant_message)

        # Update conversation title
        new_title = conversation.title
        if conversation.title == "New chat" and not prior_messages:
            new_title = _title_from_message(normalized)

        await db.execute(
            update(ChatConversation)
            .where(ChatConversation.id == conversation_id)
            .values(title=new_title, updated_at=datetime.utcnow())
        )
        await db.commit()
        await db.refresh(assistant_message)

        yield f"data: {json.dumps({'done': True, 'message_id': assistant_message.id, 'conversation_id': conversation_id})}\n\n"


chat_service = ChatService()
