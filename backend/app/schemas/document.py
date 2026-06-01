from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class DocumentCreate(BaseModel):
    title: str
    file_path: Optional[str] = None


class DocumentResponse(BaseModel):
    id: int
    title: str
    file_path: Optional[str] = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
