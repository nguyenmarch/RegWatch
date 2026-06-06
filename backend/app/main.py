import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.db import async_engine, async_session_factory
from app.core.minio_client import ensure_minio_bucket
from app.core.mysql_client import Base
from app.core.neo4j_client import close_neo4j_driver, get_neo4j_driver
from app.models import analysis as _analysis_model
from app.models import analysis_job as _analysis_job_model
from app.models import conversation as _conversation_model
from app.models import document as _document_model
from app.models import user as _user_model
from app.models import remediation_doc as _remediation_model
from app.routers import auth, chat, documents, users, remediation_doc as remediation
from app.models import analysis as _compliance_analyses_model
from app.models import report as _report_model
from app.models import action_plan as _action_plan_model

from app.routers import auth, chat, documents, users, report
from app.routers import analyses, auth, chat, documents, users
from app.services.analysis_retry import analysis_retry_loop

logger = logging.getLogger(__name__)

_ADMIN_USERNAME = "admin"
_ADMIN_EMAIL    = "admin@regwatch.com"
_ADMIN_PASSWORD = "Admin@123"

_SEED_USERS = [
    {
        "username": _ADMIN_USERNAME,
        "email": _ADMIN_EMAIL,
        "password": _ADMIN_PASSWORD,
        "role": "admin",
    },
    {
        "username": "compliance",
        "email": "compliance@regwatch.com",
        "password": "1",
        "role": "compliance",
    },
    {
        "username": "product",
        "email": "product@regwatch.com",
        "password": "1",
        "role": "product",
    },
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Add staged_cypher column if this is an existing database without it
    from sqlalchemy import text
    async with async_engine.begin() as conn:
        try:
            await conn.execute(
                text("ALTER TABLE documents ADD COLUMN staged_cypher MEDIUMTEXT NULL")
            )
        except Exception:
            pass  # Column already exists

    # Seed required demo users without touching existing accounts.
    async with async_session_factory() as db:
        from app.repositories.user import user_repo
        for seed in _SEED_USERS:
            await user_repo.ensure_seed_user(
                db,
                username=seed["username"],
                email=seed["email"],
                password=seed["password"],
                role=seed["role"],
            )
            logger.info("User ensured: username=%s role=%s", seed["username"], seed["role"])

    get_neo4j_driver()
    ensure_minio_bucket()

    # Scheduler retries analysis generation for 'pending' jobs (e.g. Gemini quota exhausted)
    retry_task = asyncio.create_task(analysis_retry_loop())

    yield

    retry_task.cancel()
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
app.include_router(report.router)


# Ensure model metadata is registered
_ = _action_plan_model


app.include_router(analyses.router)


@app.get("/health", tags=["Health"])

async def health_check() -> dict:
    return {"status": "ok", "service": "RegWatch"}
