from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from backend.models.user import User
from backend.middleware.auth import get_current_user

router = APIRouter(prefix="/prep", tags=["prep"])


class PrepRequest(BaseModel):
    company: str
    role: str
    job_description: Optional[str] = None


@router.post("/generate")
async def generate_prep_pack(
    payload: PrepRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate a full interview prep pack for a company + role."""
    from backend.services.prep_service import generate_prep_pack
    pack = await generate_prep_pack(
        company=payload.company,
        role=payload.role,
        job_description=payload.job_description or "",
    )
    return {"company": payload.company, "role": payload.role, "pack": pack}
