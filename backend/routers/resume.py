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
