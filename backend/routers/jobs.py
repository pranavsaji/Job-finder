from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel

from backend.models.database import get_db
from backend.models.job import Job
from backend.models.user import User
from backend.middleware.auth import get_current_user
from backend.services.scraper import scrape_all

router = APIRouter(prefix="/jobs", tags=["jobs"])


class ScrapeRequest(BaseModel):
    roles: List[str]
    platforms: Optional[List[str]] = None
    country: Optional[str] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    enrich_with_claude: bool = False
    limit_per_platform: int = 10          # max results to pull per platform
    date_preset: Optional[str] = None     # "1h", "24h", "7d", "30d" — maps to DDG timelimit


class JobStatusUpdate(BaseModel):
    status: str


@router.get("")
async def list_jobs(
    role: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    is_remote: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List jobs with optional filters."""
    query = db.query(Job)

    if role:
        query = query.filter(
            Job.matched_role.ilike(f"%{role}%") | Job.title.ilike(f"%{role}%")
        )

    if platform:
        query = query.filter(Job.platform == platform)

    if date_from:
        # Use scraped_at as the reliable timestamp; posted_at from snippets is often wrong
        query = query.filter(Job.scraped_at >= date_from)

    if date_to:
        query = query.filter(Job.scraped_at <= date_to)

    if status_filter:
        query = query.filter(Job.status == status_filter)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            Job.title.ilike(search_term)
            | Job.company.ilike(search_term)
            | Job.post_content.ilike(search_term)
            | Job.poster_name.ilike(search_term)
        )

    if is_remote is not None:
        query = query.filter(Job.is_remote == is_remote)

    total = query.count()
    jobs = query.order_by(Job.scraped_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "jobs": [j.to_dict() for j in jobs],
    }


@router.post("/scrape", status_code=status.HTTP_202_ACCEPTED)
async def trigger_scrape(
    payload: ScrapeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger background job scraping."""
    background_tasks.add_task(
        _run_scrape_and_save,
        db_url=db.bind.url if hasattr(db, "bind") else None,
        roles=payload.roles,
        platforms=payload.platforms,
        date_from=payload.date_from,
        date_to=payload.date_to,
        enrich_with_claude=payload.enrich_with_claude,
    )
    return {"message": "Scraping started in background", "roles": payload.roles, "platforms": payload.platforms}


@router.post("/scrape/sync")
async def trigger_scrape_sync(
    payload: ScrapeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger synchronous job scraping and return results immediately."""
    jobs_data = await scrape_all(
        roles=payload.roles,
        platforms=payload.platforms,
        country=payload.country,
        date_from=payload.date_from,
        date_to=payload.date_to,
        enrich_with_claude=payload.enrich_with_claude,
        limit_per_platform=payload.limit_per_platform,
        date_preset=payload.date_preset,
    )

    # Supplement with LinkedIn authenticated scraper if user has saved credentials
    # and linkedin is in the requested platforms (or all platforms requested)
    wants_linkedin = (
        not payload.platforms or "linkedin" in (payload.platforms or [])
    )
    prefs = current_user.scraping_preferences or {}
    li_email = prefs.get("linkedin_email")
    li_enc = prefs.get("linkedin_password_enc")
    if wants_linkedin and li_email and li_enc:
        try:
            from backend.services.linkedin_auth_scraper import scrape_linkedin_authenticated, decrypt_password
            password = decrypt_password(li_enc)
            li_result = await scrape_linkedin_authenticated(
                email=li_email,
                password=password,
                roles=payload.roles,
                country=payload.country,
                date_from=payload.date_from,
                date_to=payload.date_to,
                limit_per_platform=payload.limit_per_platform,
                date_preset=payload.date_preset,
            )
            if li_result["status"] == "ok":
                # Mark as linkedin_auth to distinguish from DDG-based linkedin
                for j in li_result["jobs"]:
                    j["platform"] = "linkedin"
                    j["_source"] = "authenticated"
                jobs_data = li_result["jobs"] + jobs_data
        except Exception as e:
            print(f"LinkedIn auth scrape error: {e}")

    saved_jobs = []
    for job_data in jobs_data:
        existing = db.query(Job).filter(Job.post_url == job_data["post_url"]).first()
        if existing:
            saved_jobs.append(existing.to_dict())
            continue

        job = Job(
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
        saved_jobs.append(job.to_dict())

    db.commit()
    return {"scraped": len(jobs_data), "saved": len(saved_jobs), "jobs": saved_jobs}


@router.get("/{job_id}")
async def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single job by ID."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job.to_dict()


@router.put("/{job_id}/status")
async def update_job_status(
    job_id: int,
    payload: JobStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update job status (new, saved, applied, archived)."""
    valid_statuses = ["new", "saved", "applied", "archived"]
    if payload.status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Status must be one of: {', '.join(valid_statuses)}",
        )

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    job.status = payload.status
    db.commit()
    db.refresh(job)
    return job.to_dict()


@router.delete("", status_code=status.HTTP_200_OK)
async def delete_all_jobs(
    platforms: Optional[str] = Query(None, description="Comma-separated platforms to delete, e.g. linkedin,twitter"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete jobs from the database. Pass ?platforms=linkedin,twitter to delete only those platforms."""
    q = db.query(Job)
    if platforms:
        platform_list = [p.strip() for p in platforms.split(",") if p.strip()]
        q = q.filter(Job.platform.in_(platform_list))
    count = q.count()
    q.delete(synchronize_session=False)
    db.commit()
    return {"deleted": count}


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a job by ID."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    db.delete(job)
    db.commit()


async def _run_scrape_and_save(
    db_url,
    roles: list,
    platforms: Optional[list],
    date_from: Optional[datetime],
    date_to: Optional[datetime],
    enrich_with_claude: bool,
):
    """Background task to scrape and save jobs."""
    from backend.models.database import SessionLocal

    jobs_data = await scrape_all(
        roles=roles,
        platforms=platforms,
        date_from=date_from,
        date_to=date_to,
        enrich_with_claude=enrich_with_claude,
    )

    db = SessionLocal()
    try:
        for job_data in jobs_data:
            existing = db.query(Job).filter(Job.post_url == job_data["post_url"]).first()
            if existing:
                continue

            job = Job(
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

        db.commit()
    except Exception as e:
        print(f"Background scrape save error: {e}")
        db.rollback()
    finally:
        db.close()
