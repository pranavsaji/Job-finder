import json
import re
import os
from typing import Optional

import anthropic
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.models.database import get_db
from backend.models.job import Job
from backend.models.user import User
from backend.middleware.auth import get_current_user
from backend.services.resume_parser import parse_resume
from backend.services import claude_service
from backend.services.resume_builder import build_ats_resume_docx

router = APIRouter(prefix="/resume", tags=["resume"])


class TailorRequest(BaseModel):
    job_id: int


class GenerateRequest(BaseModel):
    job_id: int

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/upload")
async def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload and parse a resume (PDF or DOCX)."""
    filename = file.filename or ""
    ext = filename.lower().split(".")[-1] if "." in filename else ""

    if ext not in ("pdf", "docx", "doc", "txt"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF, DOCX, DOC, or TXT files are supported.",
        )

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size must be under 10 MB.",
        )

    parsed = await parse_resume(content, filename)

    if not parsed.get("raw_text") or len(parsed["raw_text"].strip()) < 50:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract text from the uploaded file. Please try a different format.",
        )

    current_user.resume_text = parsed["raw_text"]
    current_user.resume_filename = filename
    db.commit()
    db.refresh(current_user)

    # Save a version snapshot
    try:
        from backend.models.resume_version import ResumeVersion
        existing_count = (
            db.query(ResumeVersion)
            .filter(ResumeVersion.user_id == current_user.id)
            .count()
        )
        label = filename or f"Version {existing_count + 1}"
        version = ResumeVersion(
            user_id=current_user.id,
            label=label,
            resume_text=parsed["raw_text"],
            filename=filename,
        )
        db.add(version)
        db.commit()
    except Exception as _ve:
        print(f"Resume version save error: {_ve}")

    return {
        "message": "Resume uploaded and parsed successfully.",
        "filename": filename,
        "name": parsed.get("name"),
        "skills": parsed.get("skills", []),
        "character_count": len(parsed["raw_text"]),
        "preview": parsed["raw_text"][:500],
    }


@router.get("")
async def get_resume(
    current_user: User = Depends(get_current_user),
):
    """Get current user's resume info."""
    if not current_user.resume_text:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No resume uploaded yet.",
        )

    return {
        "filename": current_user.resume_filename,
        "has_resume": True,
        "character_count": len(current_user.resume_text),
        "preview": current_user.resume_text[:500],
    }


@router.delete("")
async def delete_resume(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete the current user's resume."""
    current_user.resume_text = None
    current_user.resume_filename = None
    db.commit()
    return {"message": "Resume deleted successfully."}


@router.post("/tailor")
async def tailor_resume(
    body: TailorRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Analyze how the user's resume matches a specific job and return tailoring advice."""
    if not current_user.resume_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No resume uploaded. Please upload your resume in Settings first.",
        )

    job = db.query(Job).filter(Job.id == body.job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {body.job_id} not found.",
        )

    job_info = job.to_dict()
    result = await claude_service.tailor_resume(job_info, current_user.resume_text)
    return result


@router.post("/generate")
async def generate_resume(
    body: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a complete ATS-optimized resume tailored to the job.
    Returns a downloadable DOCX file.
    """
    if not current_user.resume_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No resume uploaded. Please upload your resume first.",
        )

    job = db.query(Job).filter(Job.id == body.job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    job_info = job.to_dict()
    candidate_name = current_user.name or ""

    structured = await claude_service.generate_ats_resume(
        job_info, current_user.resume_text, candidate_name
    )

    if not structured:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Resume generation failed. Please try again.",
        )

    docx_bytes = build_ats_resume_docx(structured)

    company = (job_info.get("company") or "company").replace(" ", "_")
    role = (job_info.get("title") or job_info.get("matched_role") or "role").replace(" ", "_")[:30]
    name_slug = candidate_name.replace(" ", "_") or "resume"
    filename = f"{name_slug}_{role}_{company}_ATS.docx"

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Resume Version History ───────────────────────────────────────────────────

@router.get("/versions")
def list_resume_versions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all resume versions for the current user (metadata only, no text)."""
    from backend.models.resume_version import ResumeVersion
    versions = (
        db.query(ResumeVersion)
        .filter(ResumeVersion.user_id == current_user.id)
        .order_by(ResumeVersion.created_at.desc())
        .all()
    )
    # Return metadata without resume_text to keep response small
    result = []
    for v in versions:
        d = v.to_dict()
        d.pop("resume_text", None)
        result.append(d)
    return {"versions": result}


@router.get("/versions/{version_id}")
def get_resume_version(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a full resume version including text."""
    from backend.models.resume_version import ResumeVersion
    version = (
        db.query(ResumeVersion)
        .filter(ResumeVersion.id == version_id, ResumeVersion.user_id == current_user.id)
        .first()
    )
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    return version.to_dict()


@router.delete("/versions/{version_id}")
def delete_resume_version(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a resume version."""
    from backend.models.resume_version import ResumeVersion
    version = (
        db.query(ResumeVersion)
        .filter(ResumeVersion.id == version_id, ResumeVersion.user_id == current_user.id)
        .first()
    )
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    db.delete(version)
    db.commit()
    return {"deleted": version_id}


@router.post("/versions/{version_id}/restore")
def restore_resume_version(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore a version's text and filename back to the user's active resume."""
    from backend.models.resume_version import ResumeVersion
    version = (
        db.query(ResumeVersion)
        .filter(ResumeVersion.id == version_id, ResumeVersion.user_id == current_user.id)
        .first()
    )
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    current_user.resume_text = version.resume_text
    current_user.resume_filename = version.filename
    db.commit()
    db.refresh(current_user)
    return {
        "message": "Resume restored successfully.",
        "filename": version.filename,
        "character_count": len(version.resume_text) if version.resume_text else 0,
    }


# ── LinkedIn Profile Optimizer ───────────────────────────────────────────────

class LinkedInOptimizeRequest(BaseModel):
    headline: Optional[str] = None
    about: Optional[str] = None
    experience_bullets: Optional[str] = None
    target_role: Optional[str] = None
    target_company: Optional[str] = None


# ── Resume Critic ────────────────────────────────────────────────────────────

class CritiqueRequest(BaseModel):
    job_description: Optional[str] = None


class BuildFromCritiqueRequest(BaseModel):
    critique: dict
    job_description: Optional[str] = None


@router.post("/critique")
def critique_resume(
    payload: CritiqueRequest,
    current_user: User = Depends(get_current_user),
):
    """Brutal resume critique from a senior recruiter who screens 1000+ resumes/day."""
    if not current_user.resume_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No resume uploaded. Upload your resume first.",
        )
    import asyncio
    result = claude_service.critique_resume(
        resume_text=current_user.resume_text,
        job_description=payload.job_description or "",
    )
    return result


@router.post("/build-from-critique")
async def build_from_critique(
    payload: BuildFromCritiqueRequest,
    current_user: User = Depends(get_current_user),
):
    """Build a new ATS-optimized resume that fixes every issue from the critique. Returns DOCX."""
    if not current_user.resume_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No resume uploaded.",
        )

    structured = await claude_service.build_resume_from_critique(
        resume_text=current_user.resume_text,
        critique=payload.critique,
        job_description=payload.job_description or "",
        candidate_name=current_user.name or "",
    )

    if not structured:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Resume build failed. Please try again.",
        )

    docx_bytes = build_ats_resume_docx(structured)
    name_slug = (current_user.name or "resume").replace(" ", "_")
    filename = f"{name_slug}_Rebuilt_Resume.docx"

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/linkedin-optimize")
def optimize_linkedin(
    payload: LinkedInOptimizeRequest,
    current_user: User = Depends(get_current_user),
):
    """Analyze and optimize a LinkedIn profile using Claude."""
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    prompt = f"""Analyze and optimize this LinkedIn profile for job searching.

Target Role: {payload.target_role or 'Not specified'}
Target Company: {payload.target_company or 'Not specified'}

Current Headline: {payload.headline or 'Not provided'}
Current About: {payload.about or 'Not provided'}
Experience Bullets: {payload.experience_bullets or 'Not provided'}

Resume on file (excerpt): {(current_user.resume_text or '')[:600]}

Return JSON:
{{
  "headline_score": <0-100>,
  "about_score": <0-100>,
  "overall_score": <0-100>,
  "rewritten_headline": "<new headline under 120 chars>",
  "rewritten_about": "<new about section, 3 short paragraphs, under 300 words>",
  "keyword_gaps": ["<missing keyword 1>", "<missing keyword 2>"],
  "quick_wins": ["<actionable tip 1>", "<tip 2>", "<tip 3>"],
  "seo_tips": "<2 sentences on LinkedIn search optimization>"
}}"""

    resp = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}],
    )
    text = resp.content[0].text.strip()
    m = re.search(r'\{.*\}', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return {"error": "Could not parse response"}
