import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.middleware.auth import get_current_user
from backend.models.database import get_db
from backend.models.pipeline import PipelineEntry
from backend.models.user import User

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


# ── Pydantic models ─────────────────────────────────────────────────────────

class CreatePipelineRequest(BaseModel):
    company: str
    role: str
    stage: str = "applied"
    job_id: Optional[int] = None
    notes: Optional[str] = None
    follow_up_at: Optional[datetime.datetime] = None


class UpdateStageRequest(BaseModel):
    stage: str
    note: Optional[str] = None


class AddContactRequest(BaseModel):
    name: str
    title: Optional[str] = None
    email: Optional[str] = None
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None


class UpdatePipelineRequest(BaseModel):
    notes: Optional[str] = None
    follow_up_at: Optional[datetime.datetime] = None
    offer_amount: Optional[str] = None
    offer_details: Optional[str] = None


# ── Helpers ─────────────────────────────────────────────────────────────────

def _get_entry(db: Session, entry_id: int, user_id: int) -> PipelineEntry:
    entry = (
        db.query(PipelineEntry)
        .filter(PipelineEntry.id == entry_id, PipelineEntry.user_id == user_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline entry not found")
    return entry


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/stats")
def get_pipeline_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return counts per stage for dashboard."""
    rows = (
        db.query(PipelineEntry.stage, db.func.count(PipelineEntry.id))
        .filter(PipelineEntry.user_id == current_user.id)
        .group_by(PipelineEntry.stage)
        .all()
    )
    counts = {stage: count for stage, count in rows}
    total = sum(counts.values())
    return {"counts": counts, "total": total}


@router.get("")
def list_pipeline(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all pipeline entries for the current user, ordered by updated_at desc."""
    entries = (
        db.query(PipelineEntry)
        .filter(PipelineEntry.user_id == current_user.id)
        .order_by(PipelineEntry.updated_at.desc().nullsfirst(), PipelineEntry.created_at.desc())
        .all()
    )
    return {"entries": [e.to_dict() for e in entries]}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_pipeline_entry(
    payload: CreatePipelineRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new pipeline entry."""
    now = datetime.datetime.utcnow()
    initial_history = [
        {"stage": payload.stage, "ts": now.isoformat(), "note": "Initial stage"}
    ]
    entry = PipelineEntry(
        user_id=current_user.id,
        job_id=payload.job_id,
        company=payload.company,
        role=payload.role,
        stage=payload.stage,
        stage_history=initial_history,
        contacts=[],
        notes=payload.notes,
        follow_up_at=payload.follow_up_at,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry.to_dict()


@router.get("/{entry_id}")
def get_pipeline_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single pipeline entry."""
    entry = _get_entry(db, entry_id, current_user.id)
    return entry.to_dict()


@router.put("/{entry_id}/stage")
def update_pipeline_stage(
    entry_id: int,
    payload: UpdateStageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update stage and append to stage_history."""
    entry = _get_entry(db, entry_id, current_user.id)
    now = datetime.datetime.utcnow()
    history = list(entry.stage_history or [])
    history.append({
        "stage": payload.stage,
        "ts": now.isoformat(),
        "note": payload.note or "",
    })
    entry.stage = payload.stage
    entry.stage_history = history
    entry.updated_at = now
    db.commit()
    db.refresh(entry)
    return entry.to_dict()


@router.put("/{entry_id}")
def update_pipeline_entry(
    entry_id: int,
    payload: UpdatePipelineRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update notes, follow_up, or offer fields."""
    entry = _get_entry(db, entry_id, current_user.id)
    now = datetime.datetime.utcnow()
    if payload.notes is not None:
        entry.notes = payload.notes
    if payload.follow_up_at is not None:
        entry.follow_up_at = payload.follow_up_at
    if payload.offer_amount is not None:
        entry.offer_amount = payload.offer_amount
    if payload.offer_details is not None:
        entry.offer_details = payload.offer_details
    entry.updated_at = now
    db.commit()
    db.refresh(entry)
    return entry.to_dict()


@router.post("/{entry_id}/contacts")
def add_contact(
    entry_id: int,
    payload: AddContactRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a contact to the pipeline entry's contacts JSON array."""
    entry = _get_entry(db, entry_id, current_user.id)
    contacts = list(entry.contacts or [])
    contacts.append({
        "name": payload.name,
        "title": payload.title,
        "email": payload.email,
        "linkedin_url": payload.linkedin_url,
        "notes": payload.notes,
    })
    entry.contacts = contacts
    entry.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(entry)
    return entry.to_dict()


@router.delete("/{entry_id}/contacts/{idx}")
def remove_contact(
    entry_id: int,
    idx: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove contact by index."""
    entry = _get_entry(db, entry_id, current_user.id)
    contacts = list(entry.contacts or [])
    if idx < 0 or idx >= len(contacts):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Contact index {idx} out of range (0-{len(contacts) - 1})",
        )
    contacts.pop(idx)
    entry.contacts = contacts
    entry.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(entry)
    return entry.to_dict()


@router.delete("/{entry_id}")
def delete_pipeline_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a pipeline entry."""
    entry = _get_entry(db, entry_id, current_user.id)
    db.delete(entry)
    db.commit()
    return {"deleted": entry_id}
