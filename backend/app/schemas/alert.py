from datetime import datetime
from typing import Literal

from pydantic import BaseModel

Severity = Literal["urgent", "review", "monitor"]
Tone = Literal["danger", "safe"]
RowStatus = Literal["violation", "compliant", "risk", "missing", "neutral"]


# ── Nested blocks (khớp interface frontend ComplianceAlert) ──────────────────

class OverallRisk(BaseModel):
    value: int
    label: str


class CompareSide(BaseModel):
    source: str
    verdict: str
    quote: str
    tone: Tone


class BusinessImpact(BaseModel):
    area: str
    detail: str
    risk: Severity


class RiskScore(BaseModel):
    label: str
    value: int
    level: str


class DetailRow(BaseModel):
    col1: str
    col2: str
    col3: str
    status: RowStatus


class DetailTable(BaseModel):
    title: str
    headers: list[str]
    rows: list[DetailRow]


# ── Nội dung do LLM sinh (chưa có id/code/status của DB) ─────────────────────

class AlertContent(BaseModel):
    title: str
    summary: str
    conflict_headline: str
    deadline: str | None = None
    overall_risk: OverallRisk
    compare_left: CompareSide
    compare_right: CompareSide
    conflict_note: str
    business_impacts: list[BusinessImpact]
    risk_scores: list[RiskScore]
    risk_conclusion: str
    detail_tables: list[DetailTable]


class AlertGenerationResult(BaseModel):
    alerts: list[AlertContent]


# ── Response cho API ─────────────────────────────────────────────────────────

class AlertSummary(BaseModel):
    id: int
    code: str
    document_id: int | None = None
    title: str
    summary: str
    severity: Severity
    deadline: str | None = None
    status: str
    overall_risk: OverallRisk
    created_at: datetime


class AlertDetail(AlertContent):
    id: int
    code: str
    document_id: int | None = None
    severity: Severity
    status: str
    created_at: datetime
    generated_at: datetime | None = None


class GenerateAlertsRequest(BaseModel):
    document_id: int
