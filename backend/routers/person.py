from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from backend.models.database import get_db
from backend.models.job import Job
from backend.models.person import Person
from backend.models.user import User
from backend.middleware.auth import get_current_user
from backend.services.person_enricher import enrich_person

router = APIRouter(prefix="/person", tags=["person"])


class EnrichRequest(BaseModel):
    linkedin_url: Optional[str] = None
    name: Optional[str] = None
    company: Optional[str] = None
    job_id: Optional[int] = None


@router.get("/{job_id}")
async def get_person_for_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get enriched person info for a job poster. Fetches and caches if not found."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    existing = db.query(Person).filter(Person.job_id == job_id).first()
    if existing:
        return existing.to_dict()

    person_data = await enrich_person(job.to_dict())

    person = Person(
        name=person_data.get("name") or job.poster_name or "Unknown",
        title=person_data.get("title") or job.poster_title,
        company=person_data.get("company") or job.company,
        linkedin_url=person_data.get("linkedin_url") or job.poster_linkedin,
        twitter_handle=person_data.get("twitter_handle"),
        bio=person_data.get("bio"),
        location=person_data.get("location") or job.location,
        profile_image_url=person_data.get("profile_image_url"),
        skills=person_data.get("skills", []),
        recent_posts=person_data.get("recent_posts", []),
        enriched_at=datetime.utcnow(),
        job_id=job_id,
    )

    db.add(person)
    db.commit()
    db.refresh(person)
    return person.to_dict()


@router.post("/enrich")
async def enrich_person_manual(
    payload: EnrichRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually enrich a person's info by URL or name/company."""
    if not payload.linkedin_url and not payload.name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either a LinkedIn URL or a name.",
        )

    fake_job = {
        "id": payload.job_id,
        "poster_name": payload.name,
        "poster_title": None,
        "company": payload.company,
        "poster_linkedin": payload.linkedin_url,
        "poster_profile_url": payload.linkedin_url,
        "location": None,
        "post_content": None,
        "post_url": payload.linkedin_url,
        "platform": "linkedin",
        "posted_at": None,
    }

    person_data = await enrich_person(fake_job)

    if payload.job_id:
        existing = db.query(Person).filter(Person.job_id == payload.job_id).first()
        if existing:
            existing.name = person_data.get("name") or existing.name
            existing.bio = person_data.get("bio") or existing.bio
            existing.skills = person_data.get("skills") or existing.skills
            existing.enriched_at = datetime.utcnow()
            db.commit()
            db.refresh(existing)
            return existing.to_dict()

    return person_data
