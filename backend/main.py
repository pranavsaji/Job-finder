from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import time
from dotenv import load_dotenv

load_dotenv()

from backend.models.database import create_tables
from backend.routers import auth, jobs, resume, person, drafts, email_finder, admin as admin_router
from backend.routers import signals, alerts, network, prep, mock_interview
from backend.routers import pipeline as pipeline_router, reminders as reminders_router
from backend.routers import dashboard as dashboard_router, salary as salary_router, contacts as contacts_router

CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    *os.getenv("CORS_ORIGINS", "").split(","),
]
CORS_ORIGINS = [o.strip() for o in CORS_ORIGINS if o.strip()]

app = FastAPI(
    title="Job Info Finder API",
    description="Advanced job hunting intelligence platform with AI-powered outreach drafting.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── Middleware order matters in Starlette (LIFO for add_middleware) ──────────
# CORSMiddleware must be registered via add_middleware BEFORE the @app.middleware
# decorator so it ends up outermost in the stack and handles preflight OPTIONS
# requests before anything else can drop the connection.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add lightweight security headers.  Runs inside CORS middleware."""
    start_time = time.time()
    try:
        response = await call_next(request)
    except Exception:
        response = JSONResponse({"detail": "Internal server error"}, status_code=500)
    response.headers["X-Process-Time"] = str(round(time.time() - start_time, 4))
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(resume.router)
app.include_router(person.router)
app.include_router(drafts.router)
app.include_router(email_finder.router)
app.include_router(admin_router.router)
app.include_router(signals.router)
app.include_router(alerts.router)
app.include_router(network.router)
app.include_router(prep.router)
app.include_router(mock_interview.router)
app.include_router(pipeline_router.router)
app.include_router(reminders_router.router)
app.include_router(dashboard_router.router)
app.include_router(salary_router.router)
app.include_router(contacts_router.router)


def _migrate_db():
    """Add any missing columns without Alembic (PostgreSQL + SQLite safe).

    IMPORTANT: each migration must rollback on failure before the next one
    runs. In PostgreSQL, an unhandled exception leaves the connection in an
    aborted-transaction state, causing every subsequent statement to silently
    no-op — which is why columns were missing in prod.
    """
    import re
    from sqlalchemy import text
    from backend.models.database import engine

    # Use TIMESTAMP for PostgreSQL, DATETIME for SQLite
    is_pg = "postgresql" in str(engine.url).lower() or "psycopg" in str(engine.url).lower()
    ts_type = "TIMESTAMP" if is_pg else "DATETIME"

    migrations = [
        ("users",         "is_admin",             "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("jobs",          "user_id",               "INTEGER"),
        ("mock_sessions", "research_context",      "TEXT"),
        ("mock_sessions", "job_description",       "TEXT"),
        ("mock_sessions", "resume_snapshot",       "TEXT"),
        ("mock_sessions", "speech_metrics",        "TEXT"),
        ("mock_sessions", "cheat_flags",           "TEXT"),
        ("mock_sessions", "difficulty",            "VARCHAR(20) DEFAULT 'medium'"),
        ("mock_sessions", "ended_at",              ts_type),
        ("jobs",          "follow_up_at",          ts_type),
        ("jobs",          "match_score",           "INTEGER"),
        ("jobs",          "matched_role",          "VARCHAR(500)"),
        ("jobs",          "salary_range",          "VARCHAR(200)"),
        ("users",         "scraping_preferences",  "TEXT DEFAULT '{}'"),
        ("users",         "resume_filename",       "VARCHAR(500)"),
        ("users",         "hunter_api_key",        "VARCHAR(500)"),
        ("users",         "target_roles",          "TEXT DEFAULT '[]'"),
        ("mock_sessions", "duration_minutes",      "INTEGER DEFAULT 45"),
        ("mock_sessions", "current_code",          "TEXT"),
    ]

    with engine.connect() as conn:
        for table, column, col_type in migrations:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
                conn.commit()
                print(f"Migration applied: {table}.{column}")
            except Exception:
                conn.rollback()  # Reset aborted transaction before next migration


def _seed_admin():
    """Create the admin user from env vars if it doesn't exist yet."""
    from passlib.context import CryptContext
    from sqlalchemy.orm import Session
    from backend.models.database import SessionLocal
    from backend.models.user import User as _User

    admin_email = os.getenv("ADMIN_EMAIL", "admin@jobfinder.local")
    admin_password = os.getenv("ADMIN_PASSWORD", "changeme123")

    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
    db: Session = SessionLocal()
    try:
        existing = db.query(_User).filter(_User.email == admin_email).first()
        if not existing:
            db.add(_User(
                email=admin_email,
                hashed_password=pwd.hash(admin_password),
                name="Admin",
                is_admin=True,
                target_roles=[],
            ))
            db.commit()
            print(f"Admin user created: {admin_email}")
        elif not existing.is_admin:
            existing.is_admin = True
            db.commit()
            print(f"Admin flag applied to: {admin_email}")
    finally:
        db.close()


@app.on_event("startup")
async def startup_event():
    import logging as _logging
    _log = _logging.getLogger("startup")

    create_tables()
    _migrate_db()
    _seed_admin()

    try:
        from backend.services.alert_scheduler import start_scheduler, _smtp_configured
        start_scheduler()
        _log.info("Scheduler started successfully. SMTP configured: %s", _smtp_configured())
        print(f"[startup] Scheduler started. SMTP configured: {_smtp_configured()}")
    except Exception as exc:
        _log.error("FAILED to start alert scheduler: %s", exc, exc_info=True)
        print(f"[startup] ERROR: Failed to start alert scheduler: {exc}")

    print("Database tables created.")
    print("Job Info Finder API is running.")


@app.on_event("shutdown")
async def shutdown_event():
    from backend.services.alert_scheduler import stop_scheduler
    stop_scheduler()


@app.get("/")
async def root():
    return {
        "name": "Job Info Finder API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": time.time()}


@app.get("/debug/scheduler")
async def debug_scheduler():
    """Debug endpoint: check scheduler status and SMTP config (admin-only in prod)."""
    from backend.services.alert_scheduler import get_scheduler, _smtp_configured
    sched = get_scheduler()
    jobs = []
    if sched.running:
        for job in sched.get_jobs():
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
            })
    return {
        "scheduler_running": sched.running,
        "jobs": jobs,
        "smtp_configured": _smtp_configured(),
        "smtp_host": os.getenv("SMTP_HOST", "(not set)"),
        "smtp_user": os.getenv("SMTP_USER", "(not set)"),
        "app_url": os.getenv("APP_URL", "(not set)"),
    }


@app.get("/debug/test-email")
async def debug_test_email(to: str = ""):
    """Send a plain test email to verify SMTP credentials. Pass ?to=you@gmail.com"""
    import smtplib, ssl as _ssl
    from email.mime.text import MIMEText

    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    email_from = os.getenv("EMAIL_FROM", smtp_user)

    if not (smtp_host and smtp_user and smtp_pass):
        return {"ok": False, "error": "SMTP not fully configured", "smtp_host": smtp_host, "smtp_user": smtp_user}

    recipient = to or smtp_user  # default: send to self
    msg = MIMEText("This is a test email from Job Info Finder to verify SMTP is working.")
    msg["Subject"] = "[Job Finder] SMTP test"
    msg["From"] = f"Job Info Finder <{email_from}>"
    msg["To"] = recipient

    try:
        ctx = _ssl.create_default_context()
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls(context=ctx)
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [recipient], msg.as_string())
        return {"ok": True, "sent_to": recipient, "from": email_from, "smtp_user": smtp_user}
    except Exception as e:
        return {"ok": False, "error": str(e), "smtp_user": smtp_user, "smtp_host": smtp_host}


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={"detail": "The requested resource was not found."},
    )


@app.exception_handler(500)
async def server_error_handler(request: Request, exc):
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again."},
    )
