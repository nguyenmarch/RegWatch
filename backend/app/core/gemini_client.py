import asyncio
import json
import logging
from typing import AsyncIterator

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from app.core.config import settings

logger = logging.getLogger(__name__)

# 429 = quota exhausted → do NOT short-retry (daily quota does not recover in
# seconds); let the caller catch GeminiQuotaExceeded and push the job to
# pending/retry later. Only retry transient server errors 500/503.
_RETRYABLE_STATUS = {500, 503}
_MAX_RETRIES = 4


class GeminiQuotaExceeded(RuntimeError):
    """Gemini returned 429 RESOURCE_EXHAUSTED — quota exhausted (per minute/day)."""

_client: genai.Client | None = None
_analysis_client: genai.Client | None = None


def get_gemini_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


def get_analysis_gemini_client() -> genai.Client:
    """DEDICATED client for the analysis task (Output 1) — isolates quota from ingestion/chat."""
    global _analysis_client
    if _analysis_client is None:
        _analysis_client = genai.Client(api_key=settings.gemini_analysis_api_key)
    return _analysis_client


async def agenerate_analysis_json(
    prompt: str,
    system_instruction: str,
    response_schema: types.Schema,
) -> dict:
    """Generate structured JSON for the analysis using the dedicated Gemini key (Output 1).

    Retries with exponential backoff on transient Gemini errors (429/500/503).
    """
    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        response_mime_type="application/json",
        response_schema=response_schema,
    )
    contents = [{"role": "user", "parts": [{"text": prompt}]}]

    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            response = await get_analysis_gemini_client().aio.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=contents,
                config=config,
            )
            return json.loads(response.text)
        except genai_errors.APIError as exc:
            if exc.code == 429:
                raise GeminiQuotaExceeded(str(exc)) from exc
            if exc.code not in _RETRYABLE_STATUS or attempt == _MAX_RETRIES - 1:
                raise
            last_exc = exc
            delay = 2 ** attempt  # 1, 2, 4, 8s
            logger.warning(
                "[Analysis] Gemini %s — retry %d/%d after %ds",
                exc.code, attempt + 1, _MAX_RETRIES, delay,
            )
            await asyncio.sleep(delay)

    raise last_exc if last_exc else RuntimeError("Gemini analysis generation failed")


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