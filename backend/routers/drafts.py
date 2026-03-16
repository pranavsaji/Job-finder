from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from backend.models.database import get_db
from backend.models.job import Job
from backend.models.person import Person
from backend.models.draft import Draft
from backend.models.user import User
from backend.middleware.auth import get_current_user
from backend.services.claude_service import (
    draft_linkedin_message,
    draft_email,
    suggest_talking_points,
)

router = APIRouter(prefix="/drafts", tags=["drafts"])


class LinkedInDraftRequest(BaseModel):
    job_id: int
    custom_notes: Optional[str] = None


class EmailDraftRequest(BaseModel):
    job_id: int
    email: str
    custom_notes: Optional[str] = None


class TalkingPointsRequest(BaseModel):
    job_id: int


@router.post("/linkedin")
async def generate_linkedin_draft(
    payload: LinkedInDraftRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a personalized LinkedIn DM draft for a job."""
    job = db.query(Job).filter(Job.id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    person = db.query(Person).filter(Person.job_id == payload.job_id).first()
    person_info = person.to_dict() if person else {
        "name": job.poster_name or "Hiring Manager",
        "title": job.poster_title or "",
        "company": job.company or "",
        "bio": "",
        "skills": [],
        "recent_posts": [],
    }

    resume_text = current_user.resume_text or ""
    if payload.custom_notes:
        resume_text = f"{resume_text}\n\nAdditional context: {payload.custom_notes}"

    message_draft = await draft_linkedin_message(
        job_info=job.to_dict(),
        person_info=person_info,
        resume_text=resume_text,
        user_name=current_user.name,
    )

    existing = db.query(Draft).filter(
        Draft.job_id == payload.job_id,
        Draft.user_id == current_user.id,
        Draft.draft_type == "linkedin",
    ).first()

    if existing:
        existing.content = message_draft
        db.commit()
        db.refresh(existing)
        return existing.to_dict()

    draft = Draft(
        job_id=payload.job_id,
        user_id=current_user.id,
        draft_type="linkedin",
        content=message_draft,
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return draft.to_dict()


@router.post("/email")
async def generate_email_draft(
    payload: EmailDraftRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a personalized email draft for a job."""
    job = db.query(Job).filter(Job.id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    person = db.query(Person).filter(Person.job_id == payload.job_id).first()
    person_info = person.to_dict() if person else {
        "name": job.poster_name or "Hiring Manager",
        "title": job.poster_title or "",
        "company": job.company or "",
        "bio": "",
        "skills": [],
    }

    resume_text = current_user.resume_text or ""
    if payload.custom_notes:
        resume_text = f"{resume_text}\n\nAdditional context: {payload.custom_notes}"

    email_result = await draft_email(
        job_info=job.to_dict(),
        person_info=person_info,
        resume_text=resume_text,
        user_name=current_user.name,
        email=payload.email,
    )

    existing = db.query(Draft).filter(
        Draft.job_id == payload.job_id,
        Draft.user_id == current_user.id,
        Draft.draft_type == "email",
    ).first()

    if existing:
        existing.content = email_result["body"]
        existing.subject_line = email_result["subject"]
        db.commit()
        db.refresh(existing)
        return existing.to_dict()

    draft = Draft(
        job_id=payload.job_id,
        user_id=current_user.id,
        draft_type="email",
        content=email_result["body"],
        subject_line=email_result["subject"],
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return draft.to_dict()


@router.post("/talking-points")
async def generate_talking_points(
    payload: TalkingPointsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate personalized talking points for a job outreach."""
    job = db.query(Job).filter(Job.id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    person = db.query(Person).filter(Person.job_id == payload.job_id).first()
    person_info = person.to_dict() if person else {
        "name": job.poster_name or "",
        "title": job.poster_title or "",
        "company": job.company or "",
    }

    points = await suggest_talking_points(
        job_info=job.to_dict(),
        person_info=person_info,
        resume_text=current_user.resume_text or "",
    )

    existing = db.query(Draft).filter(
        Draft.job_id == payload.job_id,
        Draft.user_id == current_user.id,
        Draft.draft_type == "talking_points",
    ).first()

    content = "\n".join(f"- {p}" for p in points)

    if existing:
        existing.content = content
        existing.talking_points = points
        db.commit()
        db.refresh(existing)
        return existing.to_dict()

    draft = Draft(
        job_id=payload.job_id,
        user_id=current_user.id,
        draft_type="talking_points",
        content=content,
        talking_points=points,
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return draft.to_dict()


@router.get("/{job_id}")
async def get_drafts_for_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all saved drafts for a specific job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    drafts = db.query(Draft).filter(
        Draft.job_id == job_id,
        Draft.user_id == current_user.id,
    ).all()

    return {
        "job_id": job_id,
        "drafts": [d.to_dict() for d in drafts],
    }
