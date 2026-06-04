from datetime import datetime

from sqlalchemy import delete, desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import ChatConversation, ChatMessage


def _title_from_message(content: str) -> str:
    title = " ".join(content.strip().split())
    if not title:
        return "New chat"
    return title[:64] + ("..." if len(title) > 64 else "")


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
        conversation = await self.get_conversation(db, user_id, conversation_id)
        if conversation is None:
            raise ValueError("Conversation not found")

        normalized = content.strip()
        user_message = ChatMessage(
            conversation_id=conversation_id,
            role="user",
            content=normalized,
        )
        assistant_message = ChatMessage(
            conversation_id=conversation_id,
            role="assistant",
            content="Hello bro!",
        )
        db.add_all([user_message, assistant_message])

        messages = await self.get_messages(db, conversation_id)
        new_title = conversation.title
        if conversation.title == "New chat" and not messages:
            new_title = _title_from_message(normalized)

        await db.execute(
            update(ChatConversation)
            .where(ChatConversation.id == conversation_id)
            .values(title=new_title, updated_at=datetime.utcnow())
        )
        await db.commit()
        await db.refresh(user_message)
        await db.refresh(assistant_message)
        return user_message, assistant_message


chat_service = ChatService()
