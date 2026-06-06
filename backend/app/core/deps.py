from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import decode_token
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

ROLE_ADMIN = "admin"
ROLE_COMPLIANCE = "compliance"
ROLE_PRODUCT = "product"

ROLE_ALIASES = {
    "admin": ROLE_ADMIN,
    "administrator": ROLE_ADMIN,
    "boss": ROLE_ADMIN,
    "bosses": ROLE_ADMIN,
    "ceo": ROLE_ADMIN,
    "compli": ROLE_COMPLIANCE,
    "compliance": ROLE_COMPLIANCE,
    "compliance_department": ROLE_COMPLIANCE,
    "compliance_department_risk_manager": ROLE_COMPLIANCE,
    "compliance_officer": ROLE_COMPLIANCE,
    "risk": ROLE_COMPLIANCE,
    "risk_manager": ROLE_COMPLIANCE,
    "product": ROLE_PRODUCT,
    "product_it_po": ROLE_PRODUCT,
    "product_it": ROLE_PRODUCT,
    "po": ROLE_PRODUCT,
    "it": ROLE_PRODUCT,
}

ALL_ROLES = {ROLE_ADMIN, ROLE_COMPLIANCE, ROLE_PRODUCT}
REPORT_ROLES = {ROLE_ADMIN}
ANALYSIS_ROLES = {ROLE_ADMIN, ROLE_COMPLIANCE}

KB_ROLES = {
    "law": {ROLE_ADMIN, ROLE_COMPLIANCE},
    "report": {ROLE_ADMIN},
    "internal": ALL_ROLES,
}


def normalize_role(role: str | None) -> str:
    key = "".join(
        char.lower() if char.isalnum() else "_"
        for char in (role or "").strip().replace("&", " ")
    ).strip("_")
    while "__" in key:
        key = key.replace("__", "_")
    return ROLE_ALIASES.get(key, key)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    from app.repositories.user import user_repo

    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise exc
    except JWTError:
        raise exc

    user = await user_repo.get_by_id(db, int(user_id))
    if user is None or not user.is_active:
        raise exc
    return user


def require_roles(*allowed_roles: str) -> Callable:
    allowed = {normalize_role(role) for role in allowed_roles}

    async def dependency(user: User = Depends(get_current_user)) -> User:
        if normalize_role(user.role) not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource",
            )
        return user

    return dependency


def can_access_kb(role: str | None, kb_type: str | None) -> bool:
    return normalize_role(role) in KB_ROLES.get((kb_type or "").strip().lower(), set())
