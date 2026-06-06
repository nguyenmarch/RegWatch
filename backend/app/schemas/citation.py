from pydantic import BaseModel

class Citation(BaseModel):
    source_chunk_id: str

    target_document: str

    article_number: str | None = None

    clause_number: str | None = None

    point_number: str | None = None

    raw_text: str