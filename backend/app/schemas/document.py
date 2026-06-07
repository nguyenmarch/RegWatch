from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.enums import (
    DocumentStatus,
    KbType,
    DocumentType,
    RelationshipType,
    AppendixType,
)


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    status: DocumentStatus
    file_path: str | None = None
    kb_type: KbType | None = None
    created_at: datetime
    processing_log: list[dict[str, Any]] = Field(default_factory=list)
    staged_cypher: Optional[str] = None

    @field_validator("processing_log", mode="before")
    @classmethod
    def parse_processing_log(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v or []

class DocumentMetadata(BaseModel):
    """
    Top-level metadata of a legal document.
    """

    document_id: str

    document_type: DocumentType

    document_number: str

    summary: str | None = None

    issuing_authority: str | None = None

    signer: str | None = None

    issued_date: date | None = None

    effective_date: date | None = None

    model_config = ConfigDict(
        extra="ignore",
        str_strip_whitespace=True,
    )


class DocumentRelationship(BaseModel):
    relationship_type: RelationshipType

    target_document: str

    note: str | None = None

class Point(BaseModel):
    """
    Point (a, b, c, ...)
    """

    point_number: str

    content: str


class Clause(BaseModel):
    """
    Clause (Khoản)
    """

    clause_number: str | None = None

    content: str

    points: list[Point] = Field(default_factory=list)


class Article(BaseModel):
    """
    Article (Điều)
    """

    article_number: str

    title: str | None = None

    introductory_content: str | None = None

    clauses: list[Clause] = Field(default_factory=list)


class Section(BaseModel):
    """
    Section (Mục)
    """

    section_number: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    articles: list[Article] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_has_articles(self):
        if not self.articles:
            raise ValueError("Section must contain at least one article")
        return self


class Chapter(BaseModel):
    """
    Chapter (Chương)

    A Chapter can contain either:
    - Multiple Sections (which contain Articles)
    - Multiple Articles directly
    - Or both (mixed structure)

    At least one of sections or articles must be present.
    """

    chapter_number: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    sections: list[Section] = Field(default_factory=list)
    articles: list[Article] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_has_content(self):
        """Ensure Chapter has at least sections or articles."""
        if not self.sections and not self.articles:
            raise ValueError(
                "Chapter must contain at least one section or one article. "
                "Current chapter has neither."
            )
        return self


class Appendix(BaseModel):
    appendix_number: str

    title: str | None = None

    introduction: str | None = None

    appendix_type: AppendixType | None = None

    table_data: list[dict[str, Any]] = Field(default_factory=list)

    text_data: list[str] = Field(default_factory=list)

class LegalDocument(BaseModel):
    """
    Unified legal document model supporting:

    - Decrees
    - Circulars
    - Decisions

    Content can contain either:

    Decision:
        Article
        Article
        Article

    Or:

    Chapter
        -> Article

    Or:

    Chapter
        -> Section
            -> Article
    """

    metadata: DocumentMetadata

    relationships: list[DocumentRelationship] = Field(
        default_factory=list
    )

    content: list[Chapter | Article]

    appendices: list[Appendix] = Field(
        default_factory=list
    )

    model_config = ConfigDict(
        extra="ignore",
        str_strip_whitespace=True,
    )



class LegalPath(BaseModel):
    """
    Hierarchical position inside the legal document.
    """

    chapter: str | None = None

    section: str | None = None

    article: str | None = None

    clause: str | None = None

    point: str | None = None


class LegalChunk(BaseModel):
    """
    Normalized chunk for vector databases.
    """

    chunk_id: str

    document_id: str

    text: str

    chunk_type: str = "TEXT"

    path: LegalPath

    metadata: dict[str, Any] = Field(default_factory=dict)

class GraphNode(BaseModel):
    node_id: str

    label: str

    properties: dict[str, Any] = Field(default_factory=dict)


class GraphRelationship(BaseModel):
    source_id: str

    target_id: str

    relationship_type: str

    properties: dict[str, Any] = Field(default_factory=dict)

class LegalCitation(BaseModel):
    cited_document: str

    article: str | None = None

    clause: str | None = None

    point: str | None = None