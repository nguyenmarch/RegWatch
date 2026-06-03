import io
from pathlib import Path

import fitz  # PyMuPDF
from docx import Document


def parse_pdf(file_bytes: bytes) -> str:
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    pages = [page.get_text() for page in doc]
    doc.close()
    return "\n".join(pages)


def parse_docx(file_bytes: bytes) -> str:
    doc = Document(io.BytesIO(file_bytes))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def parse_document(filename: str, file_bytes: bytes) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return parse_pdf(file_bytes)
    if ext in (".docx", ".doc"):
        return parse_docx(file_bytes)
    raise ValueError(f"Unsupported file type: '{ext}'. Accepted: .pdf, .docx, .doc")
