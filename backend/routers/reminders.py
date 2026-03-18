import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.middleware.auth import get_current_user
from backend.models.database import get_db
from backend.models.job import Job
from backend.models.user import User

router = APIRouter(prefix="/reminders", tags=["reminders"])


class SetReminderRequest(BaseModel):
    follow_up_at: Optional[datetime.datetime] = None


@router.get("/due")
def get_due_reminders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return jobs where follow_up_at <= now and status is not archived."""
    now = datetime.datetime.utcnow()
    jobs = (
        db.query(Job)
        .filter(
            Job.user_id == current_user.id,
            Job.follow_up_at != None,  # noqa: E711
            Job.follow_up_at <= now,
            Job.status != "archived",
        )
        .order_by(Job.follow_up_at.asc())
        .all()
    )
    return {"due": [j.to_dict() for j in jobs], "count": len(jobs)}


@router.put("/{job_id}")
def set_reminder(
    job_id: int,
    payload: SetReminderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set or clear follow_up_at for a job."""
    job = (
        db.query(Job)
        .filter(Job.id == job_id, Job.user_id == current_user.id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    job.follow_up_at = payload.follow_up_at
    db.commit()
    db.refresh(job)
    return job.to_dict()


@router.get("/pipeline")
def get_pipeline_due_reminders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return PipelineEntry items where follow_up_at <= now."""
    now = datetime.datetime.utcnow()
    try:
        from backend.models.pipeline import PipelineEntry
        entries = (
            db.query(PipelineEntry)
            .filter(
                PipelineEntry.user_id == current_user.id,
                PipelineEntry.follow_up_at != None,  # noqa: E711
                PipelineEntry.follow_up_at <= now,
            )
            .order_by(PipelineEntry.follow_up_at.asc())
            .all()
        )
        return {"due": [e.to_dict() for e in entries], "count": len(entries)}
    except Exception as e:
        return {"due": [], "count": 0, "error": str(e)}
