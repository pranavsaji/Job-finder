from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from backend.models.database import get_db
from backend.models.user import User
from backend.middleware.auth import get_current_user
from backend.services.email_service import find_email_no_api, verify_email

router = APIRouter(prefix="/email", tags=["email"])


class FindEmailRequest(BaseModel):
    name: str
    company: Optional[str] = None
    domain: Optional[str] = None
    linkedin_url: Optional[str] = None


@router.post("/find")
async def find_email_endpoint(
    payload: FindEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Find email address for a person without any paid APIs.
    Searches GitHub profiles, company websites, Google, and commit history.
    Detects the company email pattern from real employee emails found online,
    then generates pattern-matched guesses clearly labelled as guessed.
    """
    if not payload.name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name is required.",
        )
    if not payload.company and not payload.domain:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either a company name or a domain.",
        )

    result = await find_email_no_api(
        name=payload.name,
        company=payload.company or "",
        domain=payload.domain or None,
        linkedin_url=payload.linkedin_url or None,
    )
    return result


@router.get("/verify/{email:path}")
async def verify_email_endpoint(
    email: str,
    current_user: User = Depends(get_current_user),
):
    """Verify an email via MX record check and SMTP handshake."""
    result = await verify_email(email)
    return result
