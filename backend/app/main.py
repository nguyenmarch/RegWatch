import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.db import async_engine, async_session_factory
from app.core.minio_client import ensure_minio_bucket
from app.core.mysql_client import Base
from app.core.neo4j_client import close_neo4j_driver, get_neo4j_driver
from app.models import conversation as _conversation_model
from app.models import document as _document_model
from app.models import user as _user_model
from app.models import alert as _compliance_alert_model
from app.models import action_plan as _action_plan_model
from app.routers import auth, chat, documents, users, actionplan

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

        # Seed compliance alerts and action plans if none exist
        from sqlalchemy import select
        from app.models.alert import ComplianceAlert
        from app.models.action_plan import ActionPlan

        result = await db.execute(select(ComplianceAlert))
        if not result.scalars().first():
            alert1 = ComplianceAlert(
                id=1,
                code="ALERT-2025-00024",
                title="Thông tư 50/2024/TT-NHNN",
                summary="Yêu cầu mới về xác minh danh tính khách hàng",
                severity="CRITICAL",
                deadline="2025-06-15",
                status="open",
                business_impacts={"estimated_impact": "28.7 tỷ"},
                created_at=datetime.fromisoformat("2025-01-15T10:00:00"),
                generated_at=datetime.fromisoformat("2025-01-15T10:00:00")
            )
            alert2 = ComplianceAlert(
                id=2,
                code="ALERT-2025-00023",
                title="Nghi định 12/2025/NĐ-NHNN",
                summary="Thay đổi quy định về báo cáo tài chính",
                severity="HIGH",
                deadline="2025-04-10",
                status="open",
                business_impacts={"estimated_impact": "15.2 tỷ"},
                created_at=datetime.fromisoformat("2025-01-10T10:00:00"),
                generated_at=datetime.fromisoformat("2025-01-10T10:00:00")
            )
            db.add_all([alert1, alert2])
            await db.commit()

            ap1 = ActionPlan(
                alert_id=1,
                items=[
                    {
                        "id": 1,
                        "alert_id": 1,
                        "action_description": "Cập nhật hệ thống nhận dạng khách hàng (KYC)",
                        "responsible_department": "Khối Công nghệ",
                        "target_date": "2025-08-25",
                        "estimated_budget": 12000000000,
                        "estimated_risk": "Cao",
                        "code": "AP-001",
                        "status": "Cần xử lý"
                    }
                ]
            )
            ap2 = ActionPlan(
                alert_id=2,
                items=[
                    {
                        "id": 2,
                        "alert_id": 2,
                        "action_description": "Sửa đổi quy trình xác thực khách hàng",
                        "responsible_department": "Khối Vận hành",
                        "target_date": "2025-09-15",
                        "estimated_budget": 6500000000,
                        "estimated_risk": "Trung bình",
                        "code": "AP-002",
                        "status": "Cần xử lý"
                    }
                ]
            )
            db.add_all([ap1, ap2])
            await db.commit()
            logger.info("Compliance alerts and action plans seeded successfully")

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
app.include_router(actionplan.router)


@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    return {"status": "ok", "service": "RegWatch"}
