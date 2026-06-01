from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    role: Optional[str] = "viewer"

class UserCreate(UserBase):
    """Data required to register a new user."""
    password: str = Field(..., min_length=8)

class UserResponse(UserBase):
    """Data safe to send back to the frontend (No passwords!)."""
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True 