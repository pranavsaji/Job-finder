"""
Job alerts: save role+platform configs, check for new matches on demand.
Alert configs are stored in user.scraping_preferences["alerts"] JSON column.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
import uuid

from backend.models.database import get_db
from backend.models.user import User
from backend.middleware.auth import get_current_user

router = APIRouter(prefix="/alerts", tags=["alerts"])


class AlertCreate(BaseModel):
    roles: List[str]
    platforms: Optional[List[str]] = None
    date_preset: str = "24h"
    label: Optional[str] = None
    webhook_url: Optional[str] = None
    email_interval_hours: int = 24   # how often to email: 1, 2, 4, 6, 12, 24
    country: Optional[str] = None    # e.g. "United States", "India", "Remote"


@router.get("")
async def list_alerts(current_user: User = Depends(get_current_user)):
    """Return the user's saved alert configurations."""
    prefs = current_user.scraping_preferences or {}
    return {"alerts": prefs.get("alerts", [])}


@router.post("")
async def create_alert(
    payload: AlertCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save a new alert configuration."""
    prefs = dict(current_user.scraping_preferences or {})
    alerts = list(prefs.get("alerts", []))
    new_alert = {
        "id": str(uuid.uuid4()),
        "roles": payload.roles,
        "platforms": payload.platforms,
        "date_preset": payload.date_preset,
        "label": payload.label or ", ".join(payload.roles[:2]),
        "created_at": __import__("datetime").datetime.utcnow().isoformat(),
        "last_checked": None,
        "last_count": 0,
        "webhook_url": payload.webhook_url,
        "email_interval_hours": max(1, payload.email_interval_hours),
        "country": payload.country or None,
        "last_emailed_at": None,
    }
    alerts.append(new_alert)
    prefs["alerts"] = alerts
    current_user.scraping_preferences = prefs
    db.commit()
    return new_alert


@router.delete("/{alert_id}")
async def delete_alert(
    alert_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an alert by ID."""
    prefs = dict(current_user.scraping_preferences or {})
    alerts = [a for a in prefs.get("alerts", []) if a.get("id") != alert_id]
    prefs["alerts"] = alerts
    current_user.scraping_preferences = prefs
    db.commit()
    return {"deleted": alert_id}


@router.post("/{alert_id}/check")
async def check_alert(
    alert_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run a scrape for this alert and return matching jobs."""
    prefs = dict(current_user.scraping_preferences or {})
    alerts = prefs.get("alerts", [])
    alert = next((a for a in alerts if a.get("id") == alert_id), None)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    from backend.services.scraper import scrape_all
    jobs = await scrape_all(
        roles=alert["roles"],
        platforms=alert.get("platforms"),
        date_preset=alert.get("date_preset", "24h"),
        limit_per_platform=15,
    )

    # Update last_checked
    import datetime
    for a in alerts:
        if a.get("id") == alert_id:
            a["last_checked"] = datetime.datetime.utcnow().isoformat()
            a["last_count"] = len(jobs)
    prefs["alerts"] = alerts
    current_user.scraping_preferences = prefs
    db.commit()

    # Serialize posted_at
    for j in jobs:
        if isinstance(j.get("posted_at"), __import__("datetime").datetime):
            j["posted_at"] = j["posted_at"].isoformat()

    return {"alert_id": alert_id, "count": len(jobs), "jobs": jobs[:30]}
