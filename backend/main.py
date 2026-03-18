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


def _migrate_db():
    """Add any missing columns without Alembic (SQLite-safe)."""
    from sqlalchemy import text
    from backend.models.database import engine
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0"))
            conn.commit()
            print("Migration applied: users.is_admin")
        except Exception:
            pass  # Column already exists
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN user_id INTEGER"))
            conn.commit()
            print("Migration applied: jobs.user_id")
        except Exception:
            pass  # Column already exists


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
    create_tables()
    _migrate_db()
    _seed_admin()
    from backend.services.alert_scheduler import start_scheduler
    start_scheduler()
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
