import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.middleware.auth import get_current_user
from backend.models.database import get_db
from backend.models.job import Job
from backend.models.mock_session import MockSession
from backend.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def get_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.datetime.utcnow()
    week_ago = now - datetime.timedelta(days=7)
    day_ago = now - datetime.timedelta(days=1)

    # Jobs
    total_jobs = db.query(Job).filter(Job.user_id == current_user.id).count()
    new_jobs_today = db.query(Job).filter(
        Job.user_id == current_user.id,
        Job.scraped_at >= day_ago,
    ).count()
    saved_jobs = db.query(Job).filter(
        Job.user_id == current_user.id, Job.status == "saved"
    ).count()
    applied_jobs = db.query(Job).filter(
        Job.user_id == current_user.id, Job.status == "applied"
    ).count()

    # Follow-ups due
    followups_due = db.query(Job).filter(
        Job.user_id == current_user.id,
        Job.follow_up_at <= now,
        Job.follow_up_at != None,  # noqa: E711
        Job.status != "archived",
    ).count()

    # Pipeline (if table exists)
    pipeline_counts = {}
    try:
        from backend.models.pipeline import PipelineEntry
        stages = (
            db.query(PipelineEntry.stage, db.func.count(PipelineEntry.id))
            .filter(PipelineEntry.user_id == current_user.id)
            .group_by(PipelineEntry.stage)
            .all()
        )
        pipeline_counts = {s: c for s, c in stages}
    except Exception:
        pass

    # Mock interview stats
    completed_sessions = (
        db.query(MockSession)
        .filter(
            MockSession.user_id == current_user.id,
            MockSession.status == "completed",
        )
        .all()
    )

    avg_score = 0
    recent_verdict = None
    if completed_sessions:
        scores = [
            s.evaluation.get("overall_score", 0)
            for s in completed_sessions
            if s.evaluation
        ]
        avg_score = round(sum(scores) / len(scores)) if scores else 0
        latest = max(
            completed_sessions,
            key=lambda s: s.started_at or datetime.datetime.min,
        )
        recent_verdict = (latest.evaluation or {}).get("verdict")

    # Recent top-matched jobs
    top_matches = (
        db.query(Job)
        .filter(
            Job.user_id == current_user.id,
            Job.match_score != None,  # noqa: E711
            Job.status == "new",
        )
        .order_by(Job.match_score.desc())
        .limit(5)
        .all()
    )

    return {
        "jobs": {
            "total": total_jobs,
            "new_today": new_jobs_today,
            "saved": saved_jobs,
            "applied": applied_jobs,
        },
        "followups_due": followups_due,
        "pipeline": pipeline_counts,
        "mock": {
            "total_sessions": len(completed_sessions),
            "avg_score": avg_score,
            "recent_verdict": recent_verdict,
        },
        "top_matches": [
            {
                "id": j.id,
                "title": j.title,
                "company": j.company,
                "match_score": j.match_score,
            }
            for j in top_matches
        ],
        "has_resume": bool(current_user.resume_text),
    }
