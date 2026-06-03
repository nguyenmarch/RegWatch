from google import genai
from google.genai import types

from app.core.config import settings

_client: genai.Client | None = None
_embed_client: genai.Client | None = None


def get_gemini_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


def _get_embed_client() -> genai.Client:
    global _embed_client
    if _embed_client is None:
        _embed_client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _embed_client


def embed_texts(texts: list[str]) -> list[list[float]]:
    result = _get_embed_client().models.embed_content(
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
