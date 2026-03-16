from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import time
from dotenv import load_dotenv

load_dotenv()

from backend.models.database import create_tables
from backend.routers import auth, jobs, resume, person, drafts, email_finder

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


@app.on_event("startup")
async def startup_event():
    create_tables()
    print("Database tables created.")
    print("Job Info Finder API is running.")


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
