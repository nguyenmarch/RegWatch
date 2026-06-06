from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from app.schemas.document import (
    Chuong,
    Dieu,
    DocumentInfo,
    Khoan,
    LegalDocument,
    PhuLuc,
)

logger = logging.getLogger(__name__)


class SemanticChunk(BaseModel):
    chunk_id: str
    text_content: str
    metadata: dict[str, Any]


def _make_chunk(
    doc_info: DocumentInfo,
    context_path: str,
    chunk_id: str,
    content: str,
    extra_meta: dict[str, Any] | None = None,
) -> SemanticChunk:
    header = f"[{doc_info.loai_van_ban} {doc_info.so_hieu} - {context_path}]"
    full_text = f"{header}\n{content}"

    meta: dict[str, Any] = {
        "document_id": doc_info.document_id,
        "loai_van_ban": doc_info.loai_van_ban,
        "so_hieu": doc_info.so_hieu,
    }
    if extra_meta:
        meta.update(extra_meta)

    return SemanticChunk(chunk_id=chunk_id, text_content=full_text, metadata=meta)


def chunk_legal_document(doc: LegalDocument) -> list[SemanticChunk]:
    chunks: list[SemanticChunk] = []
    doc_info = doc.document_info

    def _process_dieu(dieu: Dieu, path_prefix: str) -> None:
        dieu_path = f"{path_prefix}Điều {dieu.dieu_so}: {dieu.dieu_ten or ''}".strip()

        if dieu.noi_dung_truoc_khoan:
            cid = f"{doc_info.document_id}_D{dieu.dieu_so}_intro"
            chunks.append(
                _make_chunk(
                    doc_info,
                    dieu_path,
                    cid,
                    dieu.noi_dung_truoc_khoan,
                    {"dieu_so": dieu.dieu_so},
                )
            )

        for khoan in dieu.khoan:
            _process_khoan(khoan, dieu, dieu_path)

    def _process_khoan(khoan: Khoan, dieu: Dieu, dieu_path: str) -> None:
        khoan_label = f"Khoản {khoan.khoan_so}" if khoan.khoan_so else "Nội dung"
        khoan_path = f"{dieu_path} | {khoan_label}"

        meta_qdrant = khoan.metadata_cho_qdrant.model_dump() if khoan.metadata_cho_qdrant else {}
        chunk_id = meta_qdrant.pop(
            "chunk_id",
            f"{doc_info.document_id}_D{dieu.dieu_so}_K{khoan.khoan_so or 'x'}",
        )

        meta: dict[str, Any] = {"dieu_so": dieu.dieu_so, "khoan_so": khoan.khoan_so}
        meta.update(meta_qdrant)

        if not khoan.diem:
            chunks.append(_make_chunk(doc_info, khoan_path, chunk_id, khoan.noi_dung, meta))
        else:
            if khoan.noi_dung.strip():
                chunks.append(
                    _make_chunk(doc_info, khoan_path, chunk_id, khoan.noi_dung, meta)
                )

            for diem in khoan.diem:
                diem_path = f"{khoan_path} | Điểm {diem.diem_so}"
                diem_mq = diem.metadata_cho_qdrant.model_dump() if diem.metadata_cho_qdrant else {}
                diem_chunk_id = diem_mq.pop("chunk_id", f"{chunk_id}_d{diem.diem_so}")

                diem_meta: dict[str, Any] = {
                    "dieu_so": dieu.dieu_so,
                    "khoan_so": khoan.khoan_so,
                    "diem_so": diem.diem_so,
                }
                diem_meta.update(diem_mq)

                combined = f"{khoan.noi_dung}\n{diem.diem_so}) {diem.noi_dung}"
                chunks.append(
                    _make_chunk(doc_info, diem_path, diem_chunk_id, combined, diem_meta)
                )

    for item in doc.content:
        if isinstance(item, Chuong):
            chuong_path = f"Chương {item.chuong_so}: {item.chuong_ten} | "

            for dieu in item.dieu_luat:
                _process_dieu(dieu, chuong_path)

            for muc in item.muc:
                muc_path = f"{chuong_path}Mục {muc.muc_so}: {muc.muc_ten} | "
                for dieu in muc.dieu_luat:
                    _process_dieu(dieu, muc_path)

        elif isinstance(item, Dieu):
            _process_dieu(item, "")

    for phu_luc in doc.phu_luc:
        chunks.extend(_chunk_phu_luc(doc_info, phu_luc))

    return chunks


def split_legal_document(
    text: str,
    doc_id: int,
    filename: str,
) -> list[SemanticChunk]:
    """Paragraph-aware sliding-window chunker for raw PDF/DOCX text."""
    from app.core.config import settings

    size = settings.CHUNK_SIZE
    overlap = settings.CHUNK_OVERLAP
    doc_id_str = str(doc_id)
    stem = Path(filename).stem

    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    logger.info("[Chunker] split_legal_document — doc_id=%s, paragraphs=%d, size=%d, overlap=%d",
                doc_id, len(paragraphs), size, overlap)

    chunks: list[SemanticChunk] = []
    buf: list[str] = []
    buf_len = 0
    idx = 0

    def _flush(buf: list[str], idx: int) -> SemanticChunk:
        body = "\n\n".join(buf)
        return SemanticChunk(
            chunk_id=f"{doc_id_str}_chunk_{idx}",
            text_content=body,
            metadata={
                "document_id": doc_id_str,
                "filename": stem,
                "chunk_index": idx,
            },
        )

    for para in paragraphs:
        if buf_len + len(para) > size and buf:
            chunks.append(_flush(buf, idx))
            idx += 1
            tail: list[str] = []
            tail_len = 0
            for p in reversed(buf):
                if tail_len + len(p) > overlap:
                    break
                tail.insert(0, p)
                tail_len += len(p)
            buf, buf_len = tail, tail_len
        buf.append(para)
        buf_len += len(para)

    if buf:
        chunks.append(_flush(buf, idx))

    logger.info("[Chunker] Produced %d chunks from doc_id=%s", len(chunks), doc_id)
    return chunks


def _chunk_phu_luc(doc_info: DocumentInfo, pl: PhuLuc) -> list[SemanticChunk]:
    out: list[SemanticChunk] = []
    path = f"Phụ lục {pl.phu_luc_so}: {pl.ten_phu_luc or ''}"
    base_id = f"{doc_info.document_id}_PL{pl.phu_luc_so}"

    if pl.noi_dung_dan_nhap:
        out.append(
            _make_chunk(
                doc_info,
                path,
                f"{base_id}_intro",
                pl.noi_dung_dan_nhap,
                {"phu_luc_so": pl.phu_luc_so},
            )
        )

    for idx, text in enumerate(pl.du_lieu_van_ban):
        out.append(
            _make_chunk(
                doc_info,
                path,
                f"{base_id}_vb{idx}",
                text,
                {"phu_luc_so": pl.phu_luc_so},
            )
        )

    if pl.du_lieu_bang:
        table_text = json.dumps(pl.du_lieu_bang, ensure_ascii=False, indent=2)
        out.append(
            _make_chunk(
                doc_info,
                path,
                f"{base_id}_table",
                table_text,
                {"phu_luc_so": pl.phu_luc_so, "kieu": "bang"},
            )
        )

    return out
