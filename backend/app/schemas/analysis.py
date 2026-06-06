from datetime import datetime
from typing import Literal

from pydantic import BaseModel

Severity = Literal["urgent", "review", "monitor"]
Tone = Literal["danger", "safe"]
RowStatus = Literal["violation", "compliant", "risk", "missing", "neutral"]


# ── Nested blocks (match frontend ComplianceAnalysis interface) ─────────────────────────────────

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


# ── LLM-generated content (without DB id/code/status) ───────────────────────

class AnalysisContent(BaseModel):
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


class AnalysisGenerationResult(BaseModel):
    analyses: list[AnalysisContent]


# ── Response cho API ─────────────────────────────────────────────────────────

class AnalysisSummary(BaseModel):
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


class AnalysisDetail(AnalysisContent):
    id: int
    code: str
    document_id: int | None = None
    severity: Severity
    status: str
    created_at: datetime
    generated_at: datetime | None = None


class GenerateAnalysisRequest(BaseModel):
    document_id: int


class AnalysisUpdate(BaseModel):
    """Editable analysis content from the frontend (all fields optional)."""
    title: str | None = None
    summary: str | None = None
    conflict_headline: str | None = None
    deadline: str | None = None
    overall_risk: OverallRisk | None = None
    compare_left: CompareSide | None = None
    compare_right: CompareSide | None = None
    conflict_note: str | None = None
    business_impacts: list[BusinessImpact] | None = None
    risk_scores: list[RiskScore] | None = None
    risk_conclusion: str | None = None
    detail_tables: list[DetailTable] | None = None
