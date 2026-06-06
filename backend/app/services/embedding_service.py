from __future__ import annotations

import threading
from abc import ABC, abstractmethod

import httpx

from app.core.config import settings
from app.utils.logger import logger


class _EmbeddingBackend(ABC):
    @abstractmethod
    def embed(self, texts: list[str]) -> list[list[float]]:
        ...


class _SentenceTransformerBackend(_EmbeddingBackend):
    def __init__(self, model_name: str):
        import os
        os.environ.setdefault("OMP_NUM_THREADS", "2")
        os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
        from sentence_transformers import SentenceTransformer

        logger.info("Loading sentence-transformers model: %s", model_name)
        self._model = SentenceTransformer(model_name, device="cpu")

    def embed(self, texts: list[str]) -> list[list[float]]:
        embeddings = self._model.encode(
            texts, normalize_embeddings=True, show_progress_bar=False
        )
        return embeddings.tolist()


class _OllamaBackend(_EmbeddingBackend):
    def __init__(self, model_name: str, base_url: str):
        self._model = model_name
        self._base_url = base_url.rstrip("/")
        self._client = httpx.Client(timeout=180.0)
        logger.info(f"Using Ollama embedding model: {model_name} at {base_url}")

    def embed(self, texts: list[str]) -> list[list[float]]:
        resp = self._client.post(
            f"{self._base_url}/api/embed",
            json={"model": self._model, "input": texts},
        )
        resp.raise_for_status()
        return resp.json()["embeddings"]


_lock = threading.Lock()
_backend: _EmbeddingBackend | None = None


def _get_backend() -> _EmbeddingBackend:
    global _backend
    if _backend is None:
        with _lock:
            if _backend is None:
                if settings.EMBEDDING_BACKEND == "ollama":
                    _backend = _OllamaBackend(
                        settings.OLLAMA_EMBED_MODEL,
                        settings.OLLAMA_BASE_URL,
                    )
                else:
                    _backend = _SentenceTransformerBackend(settings.ST_MODEL_NAME)
    return _backend


def embed_texts(texts: list[str]) -> list[list[float]]:
    return _get_backend().embed(texts)


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]
