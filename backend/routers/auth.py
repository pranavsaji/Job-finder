from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from jose import jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import os

from backend.models.database import get_db
from backend.models.user import User
from backend.middleware.auth import get_current_user, SECRET_KEY, ALGORITHM

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    target_roles: Optional[List[str]] = None
    hunter_api_key: Optional[str] = None


class LinkedInCredentialsRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict


def _hash_password(password: str) -> str:
    return pwd_context.hash(password)


def _verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _create_access_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    data = {"sub": str(user_id), "exp": expire}
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)


@router.post("/register", status_code=status.HTTP_403_FORBIDDEN)
async def register():
    """Public registration is disabled. Users are added by an admin."""
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Registration is closed. Contact the administrator to get access.",
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Login with email and password to get a JWT token."""
    user = db.query(User).filter(User.email == form_data.username).first()

    if not user or not _verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = _create_access_token(user.id)
    return {"access_token": token, "token_type": "bearer", "user": user.to_dict()}


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user."""
    return current_user.to_dict()


@router.put("/profile")
async def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update user profile settings."""
    if payload.name is not None:
        current_user.name = payload.name

    if payload.target_roles is not None:
        current_user.target_roles = payload.target_roles

    if payload.hunter_api_key is not None:
        current_user.hunter_api_key = payload.hunter_api_key

    db.commit()
    db.refresh(current_user)
    return current_user.to_dict()


@router.post("/linkedin-credentials")
async def save_linkedin_credentials(
    payload: LinkedInCredentialsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save LinkedIn credentials (password is Fernet-encrypted before storage)."""
    from backend.services.linkedin_auth_scraper import encrypt_password
    try:
        enc = encrypt_password(payload.password)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Encryption error: {e}")

    prefs = dict(current_user.scraping_preferences or {})
    prefs["linkedin_email"] = payload.email
    prefs["linkedin_password_enc"] = enc
    current_user.scraping_preferences = prefs
    db.commit()
    return {"message": "LinkedIn credentials saved"}


@router.delete("/linkedin-credentials")
async def remove_linkedin_credentials(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove stored LinkedIn credentials and clear cached session."""
    from backend.services.linkedin_auth_scraper import clear_session
    prefs = dict(current_user.scraping_preferences or {})
    prefs.pop("linkedin_email", None)
    prefs.pop("linkedin_password_enc", None)
    current_user.scraping_preferences = prefs
    db.commit()
    clear_session()
    return {"message": "LinkedIn credentials removed"}


@router.get("/linkedin-credentials/status")
async def linkedin_credentials_status(current_user: User = Depends(get_current_user)):
    """Returns whether LinkedIn credentials are saved (never returns the password)."""
    prefs = current_user.scraping_preferences or {}
    return {
        "has_credentials": bool(prefs.get("linkedin_email") and prefs.get("linkedin_password_enc")),
        "email": prefs.get("linkedin_email"),
    }


@router.post("/linkedin-credentials/test")
async def test_linkedin_credentials(
    current_user: User = Depends(get_current_user),
):
    """Test the saved LinkedIn credentials by attempting a login."""
    from backend.services.linkedin_auth_scraper import scrape_linkedin_authenticated, decrypt_password
    prefs = current_user.scraping_preferences or {}
    email = prefs.get("linkedin_email")
    enc = prefs.get("linkedin_password_enc")
    if not email or not enc:
        raise HTTPException(status_code=400, detail="No credentials saved")
    try:
        password = decrypt_password(enc)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt credentials")

    result = await scrape_linkedin_authenticated(
        email=email, password=password,
        roles=["software engineer"], limit_per_platform=3, date_preset="7d",
    )
    return {
        "status": result["status"],
        "message": result["message"],
        "sample_count": len(result["jobs"]),
    }
