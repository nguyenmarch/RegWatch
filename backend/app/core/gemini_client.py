from typing import AsyncIterator

from google import genai
from google.genai import types

from app.core.config import settings

_client: genai.Client | None = None


def get_gemini_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


# ── Sync helpers (used by ingestion pipeline) ────────────────────────────────

def embed_texts(texts: list[str]) -> list[list[float]]:
    result = get_gemini_client().models.embed_content(
        model=settings.GEMINI_EMBEDDING_MODEL,
        config=types.EmbedContentConfig(output_dimensionality=settings.EMBEDDING_DIMENSION),
        contents=texts,
    )
    return [e.values for e in result.embeddings]


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]


def generate_text(prompt: str, system_instruction: str | None = None) -> str:
    config = (
        types.GenerateContentConfig(system_instruction=system_instruction)
        if system_instruction
        else None
    )
    response = get_gemini_client().models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=prompt,
        config=config,
    )
    return response.text


# ── Async helpers (used by LangGraph nodes and streaming) ────────────────────

async def aembed_text(text: str) -> list[float]:
    result = await get_gemini_client().aio.models.embed_content(
        model=settings.GEMINI_EMBEDDING_MODEL,
        config=types.EmbedContentConfig(output_dimensionality=settings.EMBEDDING_DIMENSION),
        contents=[text],
    )
    return result.embeddings[0].values


async def agenerate_text(
    question: str,
    system_instruction: str,
    history: list[dict],
) -> str:
    """Generate a response using conversation history + a new user question."""
    contents = _build_contents(question, history)
    response = await get_gemini_client().aio.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(system_instruction=system_instruction),
    )
    return response.text


async def agenerate_text_stream(
    question: str,
    system_instruction: str,
    history: list[dict],
) -> AsyncIterator[str]:
    """Stream response tokens using conversation history + a new user question."""
    contents = _build_contents(question, history)
    async for chunk in await get_gemini_client().aio.models.generate_content_stream(
        model=settings.GEMINI_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(system_instruction=system_instruction),
    ):
        if chunk.text:
            yield chunk.text


def _build_contents(question: str, history: list[dict]) -> list[dict]:
    """Convert stored history + new question into Gemini contents format."""
    contents = []
    for msg in history:
        contents.append({
            "role": msg["role"],
            "parts": msg["parts"],
        })
    contents.append({"role": "user", "parts": [{"text": question}]})
    return contents
