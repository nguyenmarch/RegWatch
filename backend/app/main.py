import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.db import async_engine, async_session_factory
from app.core.minio_client import ensure_minio_bucket
from app.core.mysql_client import Base
from app.core.neo4j_client import close_neo4j_driver, get_neo4j_driver
from app.models import conversation as _conversation_model
from app.models import document as _document_model
from app.models import user as _user_model
from app.models import remediation_doc as _remediation_model
from app.routers import auth, chat, documents, users, remediation_doc as remediation

logger = logging.getLogger(__name__)

_ADMIN_USERNAME = "admin"
_ADMIN_EMAIL    = "admin@regwatch.com"
_ADMIN_PASSWORD = "Admin@123"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed admin user if no users exist
    async with async_session_factory() as db:
        from app.repositories.user import user_repo
        if not await user_repo.exists_any(db):
            await user_repo.create(
                db,
                username=_ADMIN_USERNAME,
                email=_ADMIN_EMAIL,
                password=_ADMIN_PASSWORD,
                role="admin",
            )
            logger.info("Admin user seeded: username=admin")

    get_neo4j_driver()
    ensure_minio_bucket()
    yield
    close_neo4j_driver()


app = FastAPI(
    title="RegWatch",
    description=(
        "Hybrid Graph-RAG system for compliance and legal document retrieval "
        "in the Fintech/Banking domain."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(remediation.router)


@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    return {"status": "ok", "service": "RegWatch"}
