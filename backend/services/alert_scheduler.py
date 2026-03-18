"""
Hourly alert scheduler.

On every tick:
  - Load all users who have saved alerts
  - For each alert, scrape the configured roles/platforms
  - Save new jobs to the DB (scoped to that user)
  - Email the user if any new jobs were found

SMTP config (all optional — if not set, email step is skipped):
  SMTP_HOST     e.g. smtp.gmail.com
  SMTP_PORT     e.g. 587  (TLS/STARTTLS)
  SMTP_USER     sender address / login
  SMTP_PASS     password or app-password
  EMAIL_FROM    display address (defaults to SMTP_USER)
  APP_URL       used to build job links in the email body
"""

import asyncio
import datetime
import logging
import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from backend.models.database import SessionLocal
from backend.models.job import Job
from backend.models.user import User
from backend.services.scraper import scrape_all

log = logging.getLogger("alert_scheduler")

# ── Scheduler singleton ────────────────────────────────────────────────────
_scheduler: Optional[AsyncIOScheduler] = None


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler()
    return _scheduler


def start_scheduler():
    sched = get_scheduler()
    if not sched.running:
        sched.add_job(
            run_all_alerts,
            trigger="interval",
            hours=1,
            id="hourly_alerts",
            replace_existing=True,
            next_run_time=datetime.datetime.now() + datetime.timedelta(seconds=30),
        )
        sched.start()
        log.info("Alert scheduler started (runs every 1 h, first run in 30 s)")


def stop_scheduler():
    sched = get_scheduler()
    if sched.running:
        sched.shutdown(wait=False)


# ── Main job ───────────────────────────────────────────────────────────────

async def run_all_alerts():
    """Iterate every user's alerts, scrape, save new jobs, send email."""
    db = SessionLocal()
    try:
        users = db.query(User).all()
    finally:
        db.close()

    for user in users:
        prefs = user.scraping_preferences or {}
        alerts = prefs.get("alerts", [])
        if not alerts:
            continue
        for alert in alerts:
            try:
                await _process_alert(user, alert)
            except Exception as e:
                log.error("Error processing alert %s for user %s: %s",
                          alert.get("id"), user.id, e)


async def _process_alert(user: User, alert: dict):
    """Run one alert for one user."""
    alert_id = alert.get("id", "?")
    roles = alert.get("roles", [])
    platforms = alert.get("platforms") or None
    date_preset = alert.get("date_preset", "24h")

    if not roles:
        return

    # Auto-clean stale new jobs for this user before saving fresh results
    from backend.routers.jobs import _auto_clean
    db = SessionLocal()
    try:
        _auto_clean(db, user.id)
    finally:
        db.close()

    log.info("Running alert %s for user %s (%s) — roles=%s",
             alert_id, user.id, user.email, roles)

    try:
        jobs_data = await asyncio.wait_for(
            scrape_all(
                roles=roles,
                platforms=platforms,
                date_preset=date_preset,
                limit_per_platform=15,
            ),
            timeout=90,
        )
    except asyncio.TimeoutError:
        log.warning("Alert %s timed out", alert_id)
        return

    new_jobs = _save_new_jobs(user.id, jobs_data)
    _update_last_checked(user, alert_id, len(jobs_data))

    if new_jobs:
        log.info("Alert %s: %d new jobs found — emailing %s",
                 alert_id, len(new_jobs), user.email)
        _send_alert_email(
            to_email=user.email,
            to_name=user.name,
            alert_label=alert.get("label", ", ".join(roles[:2])),
            roles=roles,
            new_jobs=new_jobs,
        )
    else:
        log.info("Alert %s: no new jobs", alert_id)


def _save_new_jobs(user_id: int, jobs_data: list) -> list:
    """
    Insert jobs not already in the DB for this user.
    Returns list of newly inserted job dicts.
    """
    db = SessionLocal()
    newly_inserted = []
    try:
        for job_data in jobs_data:
            existing = (
                db.query(Job)
                .filter(
                    Job.post_url == job_data["post_url"],
                    Job.user_id == user_id,
                )
                .first()
            )
            if existing:
                continue

            job = Job(
                user_id=user_id,
                title=job_data.get("title"),
                company=job_data.get("company"),
                poster_name=job_data.get("poster_name"),
                poster_title=job_data.get("poster_title"),
                poster_profile_url=job_data.get("poster_profile_url"),
                poster_linkedin=job_data.get("poster_linkedin"),
                post_url=job_data["post_url"],
                platform=job_data["platform"],
                post_content=job_data.get("post_content"),
                posted_at=job_data.get("posted_at"),
                location=job_data.get("location"),
                job_type=job_data.get("job_type"),
                is_remote=job_data.get("is_remote", False),
                tags=job_data.get("tags", []),
                status="new",
                matched_role=job_data.get("matched_role"),
                salary_range=job_data.get("salary_range"),
            )
            db.add(job)
            db.flush()
            newly_inserted.append(job.to_dict())

        db.commit()
    except Exception as e:
        log.error("DB save error in alert scrape: %s", e)
        db.rollback()
    finally:
        db.close()
    return newly_inserted


def _update_last_checked(user: User, alert_id: str, count: int):
    """Persist last_checked timestamp + last_count back into user.scraping_preferences."""
    db = SessionLocal()
    try:
        db_user = db.query(User).filter(User.id == user.id).first()
        if not db_user:
            return
        prefs = dict(db_user.scraping_preferences or {})
        alerts = prefs.get("alerts", [])
        for a in alerts:
            if a.get("id") == alert_id:
                a["last_checked"] = datetime.datetime.utcnow().isoformat()
                a["last_count"] = count
        prefs["alerts"] = alerts
        db_user.scraping_preferences = prefs
        db.commit()
    except Exception as e:
        log.error("Failed to update last_checked: %s", e)
    finally:
        db.close()


# ── Email ──────────────────────────────────────────────────────────────────

def _smtp_configured() -> bool:
    return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_USER") and os.getenv("SMTP_PASS"))


def _send_alert_email(
    to_email: str,
    to_name: str,
    alert_label: str,
    roles: List[str],
    new_jobs: List[dict],
):
    if not _smtp_configured():
        log.info("SMTP not configured — skipping email to %s", to_email)
        return

    app_url = os.getenv("APP_URL", "http://localhost:3000")
    subject = f"[Job Alert] {len(new_jobs)} new job{'s' if len(new_jobs) != 1 else ''} — {alert_label}"

    # Build job rows for email
    job_rows_html = ""
    job_rows_txt = ""
    for j in new_jobs[:20]:
        title = j.get("title") or "Untitled"
        company = j.get("company") or ""
        platform = j.get("platform", "")
        url = j.get("post_url", "#")
        location = j.get("location") or ""
        remote = " · Remote" if j.get("is_remote") else ""

        job_rows_html += (
            f'<tr>'
            f'<td style="padding:8px 0;border-bottom:1px solid #2a2a3a">'
            f'<a href="{url}" style="color:#a78bfa;font-weight:600;text-decoration:none">{title}</a><br>'
            f'<span style="color:#888;font-size:13px">{company}{" · " + location if location else ""}{remote} · {platform}</span>'
            f'</td>'
            f'</tr>'
        )
        job_rows_txt += f"  • {title}{' at ' + company if company else ''} [{platform}]\n    {url}\n"

    html_body = f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:600px;margin:40px auto;background:#13131f;border:1px solid #2a2a3a;border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#1e1b4b,#13131f);padding:32px 32px 24px">
    <p style="margin:0 0 4px;color:#a78bfa;font-size:13px;font-weight:600;letter-spacing:.5px">JOB ALERT</p>
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700">{len(new_jobs)} new job{'s' if len(new_jobs) != 1 else ''} found</h1>
    <p style="margin:8px 0 0;color:#888;font-size:14px">Alert: <strong style="color:#c4b5fd">{alert_label}</strong></p>
  </div>
  <div style="padding:24px 32px">
    <table style="width:100%;border-collapse:collapse">
      {job_rows_html}
    </table>
    {"<p style='color:#666;font-size:13px;margin:16px 0 0'>+ " + str(len(new_jobs) - 20) + " more jobs…</p>" if len(new_jobs) > 20 else ""}
  </div>
  <div style="padding:20px 32px;border-top:1px solid #2a2a3a;text-align:center">
    <a href="{app_url}/jobs" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;font-size:14px">View All Jobs →</a>
  </div>
  <div style="padding:16px 32px;text-align:center">
    <p style="color:#444;font-size:12px;margin:0">Job Info Finder · You're receiving this because you set up a job alert.</p>
  </div>
</div>
</body>
</html>"""

    text_body = (
        f"Job Alert: {alert_label}\n"
        f"{len(new_jobs)} new job{'s' if len(new_jobs) != 1 else ''} found:\n\n"
        f"{job_rows_txt}\n"
        f"View all jobs: {app_url}/jobs\n"
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Job Info Finder <{os.getenv('EMAIL_FROM', os.getenv('SMTP_USER'))}>"
    msg["To"] = f"{to_name} <{to_email}>"
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            server.starttls(context=context)
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [to_email], msg.as_string())
        log.info("Alert email sent to %s (%d jobs)", to_email, len(new_jobs))
    except Exception as e:
        log.error("Failed to send alert email to %s: %s", to_email, e)
