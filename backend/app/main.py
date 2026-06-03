from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.db import async_engine
from app.core.mysql_client import Base
from app.core.neo4j_client import close_neo4j_driver, get_neo4j_driver
from app.routers import documents, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    get_neo4j_driver()
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

app.include_router(documents.router)
app.include_router(users.router)


@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    return {"status": "ok", "service": "RegWatch"}
