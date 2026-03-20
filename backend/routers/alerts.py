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
    email_interval_hours: int = 24          # how often to email: 1, 2, 4, 6, 12, 24
    countries: Optional[List[str]] = None  # e.g. ["United States", "India", "Remote"]


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
        "countries": [c for c in (payload.countries or []) if c.strip()] or None,
        "last_emailed_at": None,
    }
    alerts.append(new_alert)
    prefs["alerts"] = alerts
    current_user.scraping_preferences = prefs
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(current_user, "scraping_preferences")
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
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(current_user, "scraping_preferences")
    db.commit()
    return {"deleted": alert_id}


@router.post("/{alert_id}/check")
async def check_alert(
    alert_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run a scrape for this alert, send email, and return matching jobs."""
    prefs = dict(current_user.scraping_preferences or {})
    alerts = prefs.get("alerts", [])
    alert = next((a for a in alerts if a.get("id") == alert_id), None)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    import datetime
    from backend.services.scraper import scrape_all

    roles = alert["roles"]
    countries = alert.get("countries") or []
    # backward compat: old alerts may have single "country" field
    if not countries and alert.get("country"):
        countries = [alert["country"]]

    # Cross-join roles × countries so each combo is searched
    if countries:
        search_roles = [f"{r} {c}" for r in roles for c in countries]
    else:
        search_roles = roles

    jobs = await scrape_all(
        roles=search_roles,
        platforms=alert.get("platforms"),
        date_preset=alert.get("date_preset", "24h"),
        limit_per_platform=15,
    )

    # Serialize posted_at
    serialized = []
    for j in jobs:
        d = dict(j)
        if isinstance(d.get("posted_at"), datetime.datetime):
            d["posted_at"] = d["posted_at"].isoformat()
        serialized.append(d)

    # Save new jobs to DB (same as scheduler)
    from backend.services.alert_scheduler import _save_new_jobs
    _save_new_jobs(current_user.id, jobs)

    from sqlalchemy.orm.attributes import flag_modified
    from backend.services.alert_scheduler import _send_alert_email, _smtp_configured

    # Update last_checked (always); last_emailed_at only when email is actually sent
    now_iso = datetime.datetime.utcnow().isoformat()
    last_emailed_at = alert.get("last_emailed_at")
    email_sent = False

    for a in alerts:
        if a.get("id") == alert_id:
            a["last_checked"] = now_iso
            a["last_count"] = len(serialized)
    prefs["alerts"] = alerts
    current_user.scraping_preferences = prefs
    flag_modified(current_user, "scraping_preferences")
    db.commit()

    # Always send email on manual check (if jobs found and SMTP configured)
    if serialized and _smtp_configured():
        _send_alert_email(
            to_email=current_user.email,
            to_name=current_user.name or "",
            alert_label=alert.get("label", ", ".join(roles[:2])),
            roles=roles,
            jobs=serialized,
            countries=countries,
            email_interval_hours=alert.get("email_interval_hours", 24),
        )
        # Update last_emailed_at in DB
        last_emailed_at = now_iso
        from backend.services.alert_scheduler import _update_prefs
        _update_prefs(current_user.id, alert_id, {"last_emailed_at": last_emailed_at})
        email_sent = True

    return {
        "alert_id": alert_id,
        "count": len(serialized),
        "jobs": serialized[:30],
        "email_sent": email_sent,
        "smtp_configured": _smtp_configured(),
        "last_emailed_at": last_emailed_at,
    }
