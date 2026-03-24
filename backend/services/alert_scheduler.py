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
    """Start the APScheduler async scheduler, binding to the running event loop.

    Must be called from within a running event loop (e.g. FastAPI startup event).
    Explicitly passes the running loop to APScheduler so it works correctly on
    Python 3.10+ and Railway's container environment.
    """
    import asyncio as _asyncio

    sched = get_scheduler()
    if sched.running:
        log.info("Scheduler already running — skipping start")
        return

    # Explicitly bind to the running event loop (critical for Python 3.10+ / Railway)
    try:
        loop = _asyncio.get_running_loop()
        sched.configure(event_loop=loop)
        log.info("Scheduler bound to running event loop: %s", loop)
    except RuntimeError:
        log.warning("No running event loop found — APScheduler will try to find one itself")

    # First tick 15 seconds after startup so Railway health check passes first
    first_run = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=15)

    sched.add_job(
        run_all_alerts,
        trigger="interval",
        minutes=30,           # tick every 30 min; per-alert interval checked inside
        id="alert_tick",
        replace_existing=True,
        next_run_time=first_run,
        misfire_grace_time=3600,  # allow up to 1h grace for Railway container restarts
        coalesce=True,            # if multiple ticks missed, run only once on restart
    )
    sched.add_job(
        _check_followups,
        trigger="cron",
        hour=8,
        minute=0,
        id="daily_followups",
        replace_existing=True,
        misfire_grace_time=3600,
        coalesce=True,
    )
    sched.start()
    log.info(
        "Alert scheduler started (first tick in 15s, then every 30 min; SMTP configured: %s)",
        _smtp_configured(),
    )


def stop_scheduler():
    sched = get_scheduler()
    if sched.running:
        sched.shutdown(wait=False)


# ── Main job ───────────────────────────────────────────────────────────────

async def run_all_alerts():
    """Iterate every user's alerts, scrape, save new jobs, send email."""
    log.info("=== Alert tick starting ===")
    db = SessionLocal()
    try:
        users = db.query(User).all()
    except Exception as e:
        log.error("Failed to query users in alert tick: %s", e)
        return
    finally:
        db.close()

    total_alerts = sum(len((u.scraping_preferences or {}).get("alerts", [])) for u in users)
    log.info("Alert tick: %d users, %d total alert configs", len(users), total_alerts)

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
                          alert.get("id"), user.id, e, exc_info=True)

    log.info("=== Alert tick complete ===")


async def _process_alert(user: User, alert: dict):
    """Run one alert for one user, respecting its email_interval_hours."""
    alert_id = alert.get("id", "?")
    roles = alert.get("roles", [])
    platforms = alert.get("platforms") or None
    date_preset = alert.get("date_preset", "24h")
    email_interval_hours = int(alert.get("email_interval_hours", 24))
    countries = alert.get("countries") or []
    # backward compat: old alerts may have a single "country" field
    if not countries and alert.get("country"):
        countries = [alert["country"]]

    if not roles:
        return

    # Check whether the email interval has elapsed since last email
    now = datetime.datetime.utcnow()
    last_emailed_raw = alert.get("last_emailed_at")
    if last_emailed_raw:
        try:
            last_emailed = datetime.datetime.fromisoformat(last_emailed_raw)
            elapsed_hours = (now - last_emailed).total_seconds() / 3600
            if elapsed_hours < email_interval_hours:
                log.info(
                    "Alert %s: %.1fh since last email, interval=%dh — skipping",
                    alert_id, elapsed_hours, email_interval_hours,
                )
                return
        except Exception:
            pass  # If parsing fails, proceed

    # Cross-join roles × countries so each combination is searched
    if countries:
        search_roles = [f"{r} {c}" for r in roles for c in countries]
    else:
        search_roles = roles

    # Auto-clean stale new jobs for this user before saving fresh results
    from backend.routers.jobs import _auto_clean
    db = SessionLocal()
    try:
        _auto_clean(db, user.id)
    finally:
        db.close()

    log.info(
        "Running alert %s for user %s (%s) — roles=%s countries=%s interval=%dh",
        alert_id, user.id, user.email, roles, countries, email_interval_hours,
    )

    try:
        jobs_data = await asyncio.wait_for(
            scrape_all(
                roles=search_roles,
                platforms=platforms,
                date_preset=date_preset,
                limit_per_platform=15,
            ),
            timeout=120,
        )
    except asyncio.TimeoutError:
        log.warning("Alert %s timed out after 120s — saving partial results if any", alert_id)
        jobs_data = []
    except Exception as e:
        log.error("Alert %s scrape_all error: %s", alert_id, e, exc_info=True)
        jobs_data = []

    log.info("Alert %s scraped %d jobs", alert_id, len(jobs_data))
    _save_new_jobs(user.id, jobs_data)
    _update_last_checked(user, alert_id, len(jobs_data))

    # Serialize posted_at datetimes for email
    serialized = []
    for j in jobs_data:
        d = dict(j)
        if isinstance(d.get("posted_at"), datetime.datetime):
            d["posted_at"] = d["posted_at"].isoformat()
        serialized.append(d)

    if serialized:
        log.info("Alert %s: %d jobs found — emailing %s (interval %dh)",
                 alert_id, len(serialized), user.email, email_interval_hours)
        _send_alert_email(
            to_email=user.email,
            to_name=user.name,
            alert_label=alert.get("label", ", ".join(roles[:2])),
            roles=roles,
            jobs=serialized,
            countries=countries,
            email_interval_hours=email_interval_hours,
        )
        _update_last_emailed(user, alert_id)
        webhook_url = alert.get("webhook_url")
        if webhook_url:
            asyncio.create_task(_send_webhook(alert, serialized))
    else:
        log.info("Alert %s: no jobs found this tick", alert_id)


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


def _update_prefs(user_id: int, alert_id: str, updates: dict):
    """Apply key=value updates to a specific alert in user.scraping_preferences."""
    db = SessionLocal()
    try:
        db_user = db.query(User).filter(User.id == user_id).first()
        if not db_user:
            return
        import copy
        prefs = copy.deepcopy(db_user.scraping_preferences or {})
        for a in prefs.get("alerts", []):
            if a.get("id") == alert_id:
                a.update(updates)
        db_user.scraping_preferences = prefs
        # Force SQLAlchemy to detect JSON column mutation
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(db_user, "scraping_preferences")
        db.commit()
    except Exception as e:
        log.error("Failed to update alert prefs: %s", e)
    finally:
        db.close()


def _update_last_checked(user: User, alert_id: str, count: int):
    _update_prefs(user.id, alert_id, {
        "last_checked": datetime.datetime.utcnow().isoformat(),
        "last_count": count,
    })


def _update_last_emailed(user: User, alert_id: str):
    _update_prefs(user.id, alert_id, {
        "last_emailed_at": datetime.datetime.utcnow().isoformat(),
    })


# ── Follow-up reminder checker (runs daily at 08:00) ──────────────────────

async def _check_followups():
    """Find jobs and pipeline entries with follow_up_at within the next 24h and send reminders."""
    now = datetime.datetime.utcnow()
    window_end = now + datetime.timedelta(hours=24)

    db = SessionLocal()
    try:
        users = db.query(User).all()
        for user in users:
            # Jobs due today
            due_jobs = (
                db.query(Job)
                .filter(
                    Job.user_id == user.id,
                    Job.follow_up_at != None,
                    Job.follow_up_at >= now,
                    Job.follow_up_at <= window_end,
                    Job.status != "archived",
                )
                .all()
            )

            # Pipeline entries due today
            due_pipeline = []
            try:
                from backend.models.pipeline import PipelineEntry
                due_pipeline = (
                    db.query(PipelineEntry)
                    .filter(
                        PipelineEntry.user_id == user.id,
                        PipelineEntry.follow_up_at != None,
                        PipelineEntry.follow_up_at >= now,
                        PipelineEntry.follow_up_at <= window_end,
                    )
                    .all()
                )
            except Exception:
                pass

            total = len(due_jobs) + len(due_pipeline)
            if total == 0:
                continue

            log.info(
                "Follow-up reminders for user %s: %d jobs, %d pipeline entries",
                user.id, len(due_jobs), len(due_pipeline),
            )

            if _smtp_configured():
                lines = []
                for j in due_jobs:
                    lines.append(f"  - Job: {j.title or 'Untitled'} at {j.company or 'Unknown'}")
                for p in due_pipeline:
                    lines.append(f"  - Pipeline: {p.role} at {p.company} (stage: {p.stage})")

                subject = f"[Job Finder] Follow-up reminder: {total} item{'s' if total != 1 else ''} due today"
                body = (
                    f"Hi {user.name},\n\n"
                    f"You have {total} follow-up{'s' if total != 1 else ''} due today:\n\n"
                    + "\n".join(lines)
                    + "\n\nLog in to manage your follow-ups.\n\nJob Info Finder"
                )

                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = f"Job Info Finder <{os.getenv('EMAIL_FROM', os.getenv('SMTP_USER'))}>"
                msg["To"] = f"{user.name} <{user.email}>"
                msg.attach(MIMEText(body, "plain"))

                host = os.getenv("SMTP_HOST", "smtp.gmail.com")
                port = int(os.getenv("SMTP_PORT", "587"))
                smtp_user = os.getenv("SMTP_USER", "")
                smtp_pass = os.getenv("SMTP_PASS", "")

                try:
                    import ssl as _ssl
                    try:
                        import certifi
                        context = _ssl.create_default_context(cafile=certifi.where())
                    except ImportError:
                        context = _ssl.create_default_context()
                    with smtplib.SMTP(host, port, timeout=15) as server:
                        server.ehlo()
                        server.starttls(context=context)
                        server.login(smtp_user, smtp_pass)
                        server.sendmail(smtp_user, [user.email], msg.as_string())
                    log.info("Follow-up reminder sent to %s", user.email)
                except Exception as e:
                    log.error("Failed to send follow-up email to %s: %s", user.email, e)
    finally:
        db.close()


async def _send_webhook(alert: dict, new_jobs: list):
    """POST job matches to webhook URL if configured on the alert."""
    webhook_url = alert.get("webhook_url")
    if not webhook_url:
        return
    import httpx
    payload = {
        "alert_id": alert.get("id"),
        "alert_label": alert.get("label", ""),
        "new_jobs_count": len(new_jobs),
        "jobs": [
            {
                "title": j.get("title"),
                "company": j.get("company"),
                "url": j.get("post_url"),
                "posted_at": j.get("posted_at"),
            }
            for j in new_jobs[:10]
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(webhook_url, json=payload)
        log.info("Webhook sent to %s", webhook_url)
    except Exception as e:
        log.error("Webhook delivery failed to %s: %s", webhook_url, e)


# ── Email ──────────────────────────────────────────────────────────────────

def _smtp_configured() -> bool:
    return bool(
        os.getenv("MAILJET_API_KEY") or
        os.getenv("RESEND_API_KEY") or
        (os.getenv("SMTP_HOST") and os.getenv("SMTP_USER") and os.getenv("SMTP_PASS"))
    )


def _send_alert_email(
    to_email: str,
    to_name: str,
    alert_label: str,
    roles: List[str],
    jobs: List[dict],
    countries: Optional[List[str]] = None,
    email_interval_hours: int = 24,
):
    if not _smtp_configured():
        log.info("SMTP not configured — skipping email to %s", to_email)
        return

    app_url = os.getenv("APP_URL", "http://localhost:3000")
    interval_label = (
        f"every {email_interval_hours}h" if email_interval_hours != 24
        else "daily"
    )
    subject = (
        f"[Job Alert] {len(jobs)} job{'s' if len(jobs) != 1 else ''} — "
        f"{alert_label} ({interval_label})"
    )

    # Build job rows for email
    job_rows_html = ""
    job_rows_txt = ""
    for j in jobs[:30]:
        title = j.get("title") or "Untitled"
        company = j.get("company") or ""
        platform = j.get("platform", "")
        url = j.get("post_url", "#")
        location = j.get("location") or ""
        remote = " · Remote" if j.get("is_remote") else ""
        salary = j.get("salary_range") or ""
        salary_tag = f" · {salary}" if salary else ""

        meta_parts = [p for p in [company, location + remote, salary_tag.lstrip(" ·"), platform] if p]
        meta_str = " · ".join(meta_parts)

        job_rows_html += (
            f'<tr>'
            f'<td style="padding:10px 0;border-bottom:1px solid #1e1e2e">'
            f'<a href="{url}" style="color:#a78bfa;font-weight:600;font-size:14px;text-decoration:none">{title}</a><br>'
            f'<span style="color:#666;font-size:12px;margin-top:2px;display:block">{meta_str}</span>'
            f'</td>'
            f'<td style="padding:10px 0 10px 12px;border-bottom:1px solid #1e1e2e;vertical-align:top;white-space:nowrap">'
            f'<a href="{url}" style="color:#7c3aed;font-size:12px;text-decoration:none">View ↗</a>'
            f'</td>'
            f'</tr>'
        )
        job_rows_txt += (
            f"  • {title}{' at ' + company if company else ''}"
            f"{' (' + location + ')' if location else ''}"
            f"{' [Remote]' if j.get('is_remote') else ''}"
            f" [{platform}]\n"
            f"    {url}\n"
        )

    country_str = " / ".join(countries) if countries else ""
    country_line = f" · <strong>{country_str}</strong>" if country_str else ""
    interval_badge = (
        f'<span style="background:#1e1b4b;color:#a78bfa;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600">'
        f'Every {email_interval_hours}h</span>'
    )

    html_body = f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:620px;margin:40px auto;background:#13131f;border:1px solid #2a2a3a;border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#1e1b4b,#13131f);padding:32px 32px 20px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <p style="margin:0;color:#a78bfa;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Job Alert</p>
      {interval_badge}
    </div>
    <h1 style="margin:0 0 6px;color:#fff;font-size:26px;font-weight:800">{len(jobs)} job{'s' if len(jobs) != 1 else ''} found</h1>
    <p style="margin:0;color:#888;font-size:14px">
      <strong style="color:#c4b5fd">{alert_label}</strong>{country_line}
      &nbsp;·&nbsp;{datetime.datetime.utcnow().strftime("%b %d, %Y %H:%M UTC")}
    </p>
  </div>
  <div style="padding:20px 32px">
    <table style="width:100%;border-collapse:collapse">
      {job_rows_html}
    </table>
    {"<p style='color:#555;font-size:12px;margin:12px 0 0'>+ " + str(len(jobs) - 30) + " more jobs in the app…</p>" if len(jobs) > 30 else ""}
  </div>
  <div style="padding:20px 32px;border-top:1px solid #2a2a3a;text-align:center">
    <a href="{app_url}/jobs" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;text-decoration:none;padding:13px 32px;border-radius:10px;font-weight:700;font-size:14px">View All Jobs in App →</a>
  </div>
  <div style="padding:14px 32px;text-align:center;border-top:1px solid #1a1a2e">
    <p style="color:#333;font-size:11px;margin:0">
      Job Info Finder · Alert: {alert_label} · Sending {interval_label}
    </p>
  </div>
</div>
</body>
</html>"""

    text_body = (
        f"Job Alert: {alert_label}"
        f"{' | ' + country_str if country_str else ''} | {interval_label.title()}\n"
        f"{datetime.datetime.utcnow().strftime('%b %d, %Y %H:%M UTC')}\n\n"
        f"{len(jobs)} job{'s' if len(jobs) != 1 else ''} found:\n\n"
        f"{job_rows_txt}\n"
        f"View all: {app_url}/jobs\n"
    )

    mailjet_key = os.getenv("MAILJET_API_KEY")
    mailjet_secret = os.getenv("MAILJET_SECRET_KEY")
    resend_key = os.getenv("RESEND_API_KEY")

    if mailjet_key and mailjet_secret:
        from mailjet_rest import Client
        mj = Client(auth=(mailjet_key, mailjet_secret), version="v3.1")
        mj.send.create(data={"Messages": [{
            "From": {"Email": "pranavs9876@gmail.com", "Name": "Job Info Finder"},
            "To": [{"Email": to_email, "Name": to_name or to_email}],
            "Subject": subject,
            "HTMLPart": html_body,
            "TextPart": text_body,
        }]})
        log.info("Alert email sent via Mailjet to %s (%d jobs)", to_email, len(jobs))
    elif resend_key:
        import resend as _resend
        _resend.api_key = resend_key
        _resend.Emails.send({
            "from": "Job Info Finder <onboarding@resend.dev>",
            "to": [to_email],
            "subject": subject,
            "html": html_body,
            "text": text_body,
        })
        log.info("Alert email sent via Resend to %s (%d jobs)", to_email, len(jobs))
    else:
        host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USER", "")
        smtp_pass = os.getenv("SMTP_PASS", "")
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"Job Info Finder <{os.getenv('EMAIL_FROM', smtp_user)}>"
        msg["To"] = f"{to_name} <{to_email}>"
        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))
        try:
            try:
                import certifi
                context = ssl.create_default_context(cafile=certifi.where())
            except ImportError:
                context = ssl.create_default_context()
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.ehlo()
                server.starttls(context=context)
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_user, [to_email], msg.as_string())
            log.info("Alert email sent via SMTP to %s (%d jobs)", to_email, len(jobs))
        except Exception as e:
            log.error("Failed to send alert email to %s: %s", to_email, e)
            raise
