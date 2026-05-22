"""
Centralised RBAC helpers.

Previously scattered as _require_admin / _require_sp_admin / _require_enterprise_admin_or_sp
across admin.py, enterprise.py — consolidated here so every router imports from one place.

Usage in a router:
    from app.core.permissions import require_sp_admin, require_enterprise_admin_or_sp
    ...
    require_sp_admin(current_user)
"""
from fastapi import HTTPException, status

from app.models.user import User


def require_sp_admin(user: User) -> None:
    """Raise 403 unless user is super_admin."""
    if user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required",
        )


def require_admin(user: User) -> None:
    """Raise 403 unless user is super_admin or admin."""
    if user.role not in ("super_admin", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )


def require_enterprise_admin_or_sp(user: User, org_id: str) -> None:
    """
    Raise 403 unless:
      - user is super_admin, OR
      - user is enterprise_admin whose organization_id matches org_id.
    """
    if user.role == "super_admin":
        return
    if user.role == "enterprise_admin" and user.organization_id == org_id:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Forbidden",
    )


def require_self_or_admin(user: User, target_user_id: str) -> None:
    """Allow if user is operating on their own account or is an admin."""
    if user.id == target_user_id:
        return
    if user.role in ("super_admin", "admin"):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Forbidden",
    )
