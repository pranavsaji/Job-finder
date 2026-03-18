import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.middleware.auth import get_current_user
from backend.models.contact import Contact
from backend.models.database import get_db
from backend.models.user import User

router = APIRouter(prefix="/contacts", tags=["contacts"])


# ── Pydantic models ─────────────────────────────────────────────────────────

class CreateContactRequest(BaseModel):
    name: str
    title: Optional[str] = None
    company: Optional[str] = None
    linkedin_url: Optional[str] = None
    email: Optional[str] = None
    source: str = "manual"
    notes: Optional[str] = None
    job_id: Optional[int] = None


class UpdateContactRequest(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    company: Optional[str] = None
    linkedin_url: Optional[str] = None
    email: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    job_id: Optional[int] = None
    status: Optional[str] = None
    last_contact_at: Optional[datetime.datetime] = None


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("")
def list_contacts(
    status_filter: Optional[str] = Query(None, alias="status"),
    company: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all contacts for the user, with optional status/company filters."""
    query = db.query(Contact).filter(Contact.user_id == current_user.id)

    if status_filter:
        query = query.filter(Contact.status == status_filter)

    if company:
        query = query.filter(Contact.company.ilike(f"%{company}%"))

    contacts = query.order_by(Contact.created_at.desc()).all()
    return {"contacts": [c.to_dict() for c in contacts]}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_contact(
    payload: CreateContactRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new contact."""
    contact = Contact(
        user_id=current_user.id,
        name=payload.name,
        title=payload.title,
        company=payload.company,
        linkedin_url=payload.linkedin_url,
        email=payload.email,
        source=payload.source,
        notes=payload.notes,
        job_id=payload.job_id,
        status="discovered",
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact.to_dict()


@router.put("/{contact_id}")
def update_contact(
    contact_id: int,
    payload: UpdateContactRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a contact."""
    contact = (
        db.query(Contact)
        .filter(Contact.id == contact_id, Contact.user_id == current_user.id)
        .first()
    )
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")

    if payload.name is not None:
        contact.name = payload.name
    if payload.title is not None:
        contact.title = payload.title
    if payload.company is not None:
        contact.company = payload.company
    if payload.linkedin_url is not None:
        contact.linkedin_url = payload.linkedin_url
    if payload.email is not None:
        contact.email = payload.email
    if payload.source is not None:
        contact.source = payload.source
    if payload.notes is not None:
        contact.notes = payload.notes
    if payload.job_id is not None:
        contact.job_id = payload.job_id
    if payload.status is not None:
        contact.status = payload.status
    if payload.last_contact_at is not None:
        contact.last_contact_at = payload.last_contact_at

    db.commit()
    db.refresh(contact)
    return contact.to_dict()


@router.delete("/{contact_id}")
def delete_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a contact."""
    contact = (
        db.query(Contact)
        .filter(Contact.id == contact_id, Contact.user_id == current_user.id)
        .first()
    )
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
    db.delete(contact)
    db.commit()
    return {"deleted": contact_id}


class BulkImportRequest(BaseModel):
    people: List[dict]


@router.post("/from-network")
def bulk_import_contacts(
    payload: BulkImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk import contacts from network search results."""
    created = []
    for person in payload.people:
        contact = Contact(
            user_id=current_user.id,
            name=person.get("name", "Unknown"),
            title=person.get("title"),
            company=person.get("company"),
            linkedin_url=person.get("linkedin_url") or person.get("profile_url"),
            email=person.get("email"),
            source="network",
            notes=person.get("notes"),
            job_id=person.get("job_id"),
            status="discovered",
        )
        db.add(contact)
        db.flush()
        created.append(contact.to_dict())

    db.commit()
    return {"created": len(created), "contacts": created}
