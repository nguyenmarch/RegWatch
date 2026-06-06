from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# ── API response model ─────────────────────────────────────────


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    file_path: str | None = None
    status: str
    kb_type: str | None = None
    created_at: datetime
    processing_log: str | None = None


# ── Enums ─────────────────────────────────────────────────────


class RelationshipType(str, Enum):
    CAN_CU_PHAP_LY = "CAN_CU_PHAP_LY"
    THAY_THE = "THAY_THE"
    SUA_DOI = "SUA_DOI"
    HUONG_DAN = "HUONG_DAN"
    DAN_CHIEU = "DAN_CHIEU"


# ── Shared blocks ─────────────────────────────────────────────


class MetadataQdrant(BaseModel):
    chunk_id: str | None = None
    ngu_canh_nghiep_vu: str | None = None
    loai_thong_tin: str | None = None
    model_config = ConfigDict(extra="allow")


class DocumentInfo(BaseModel):
    document_id: str
    loai_van_ban: str
    so_hieu: str
    co_quan_ban_hanh: str | None = None
    ngay_ban_hanh: str | None = None
    ngay_hieu_luc: str | None = None
    nguoi_ky: str | None = None
    trich_yeu: str | None = Field(None, alias="chu_de")
    model_config = ConfigDict(populate_by_name=True)


class Relationship(BaseModel):
    loai_quan_he: RelationshipType
    van_ban_dich: str


# ── Content hierarchy ─────────────────────────────────────────


class Diem(BaseModel):
    diem_so: str
    noi_dung: str
    metadata_cho_qdrant: MetadataQdrant | None = None


class Khoan(BaseModel):
    khoan_so: str | None = None
    noi_dung: str
    diem: list[Diem] = Field(default_factory=list)
    metadata_cho_qdrant: MetadataQdrant | None = None


class Dieu(BaseModel):
    dieu_so: str
    dieu_ten: str | None = None
    noi_dung_truoc_khoan: str | None = None
    khoan: list[Khoan] = Field(default_factory=list)


class Muc(BaseModel):
    muc_so: str
    muc_ten: str
    dieu_luat: list[Dieu] = Field(default_factory=list)


class Chuong(BaseModel):
    chuong_so: str
    chuong_ten: str
    muc: list[Muc] = Field(default_factory=list)
    dieu_luat: list[Dieu] = Field(default_factory=list)


class PhuLuc(BaseModel):
    phu_luc_so: str
    ten_phu_luc: str | None = None
    noi_dung_dan_nhap: str | None = None
    kieu_du_lieu_chinh: str | None = None
    du_lieu_bang: list[dict[str, Any]] = Field(default_factory=list)
    du_lieu_van_ban: list[str] = Field(default_factory=list)


# ── Unified model (accepts any document type) ─────────────────


class LegalDocument(BaseModel):
    """Unified model that parses Nghị định, Quyết định, and Thông tư.

    The ``content`` field (aliased as ``noi_dung`` in JSON) accepts a mixed
    list of Chương and Điều items, covering all three document layouts.
    """

    document_info: DocumentInfo
    relationships_neo4j: list[Relationship] = Field(default_factory=list)
    content: list[Chuong | Dieu] = Field(alias="noi_dung")
    phu_luc: list[PhuLuc] = Field(default_factory=list)
    model_config = ConfigDict(populate_by_name=True)


def parse_legal_document(raw: dict[str, Any]) -> LegalDocument:
    """Parse a raw JSON dict into a validated LegalDocument.

    Accepts JSON with either ``noi_dung`` or ``content`` as the body key.
    """
    return LegalDocument.model_validate(raw)
