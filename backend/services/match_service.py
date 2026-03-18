import os
import re
import json
import anthropic


def score_job_match(resume_text: str, job_title: str, job_company: str, job_content: str) -> int:
    """Score resume match against job 0-100. Returns 0 if no resume."""
    if not resume_text or not resume_text.strip():
        return 0
    if not job_content or not job_content.strip():
        return 50  # neutral if no JD

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    prompt = f"""Score how well this resume matches this job posting. Return ONLY a JSON object: {{"score": <0-100>, "reason": "<10 words>"}}

RESUME (excerpt, first 800 chars):
{resume_text[:800]}

JOB: {job_title} at {job_company}
JOB CONTENT (first 600 chars):
{job_content[:600]}

Scoring: 90-100=excellent match, 70-89=good match, 50-69=partial match, 30-49=weak match, 0-29=poor match.
Consider: skills overlap, seniority level, domain experience."""

    try:
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}]
        )
        text = resp.content[0].text.strip()
        m = re.search(r'\{.*\}', text, re.DOTALL)
        if m:
            data = json.loads(m.group())
            return max(0, min(100, int(data.get("score", 50))))
    except Exception:
        pass
    return 0


def _score_jobs_for_user(user_id: int, db_url: str):
    """Score all unscored jobs for a user. Call after scrape completes."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from backend.models.job import Job
    from backend.models.user import User

    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)

    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False} if "sqlite" in db_url else {},
    )
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.resume_text:
            return

        unscored = (
            db.query(Job)
            .filter(Job.user_id == user_id, Job.match_score == None)  # noqa: E711
            .all()
        )

        for job in unscored:
            try:
                score = score_job_match(
                    resume_text=user.resume_text,
                    job_title=job.title or "",
                    job_company=job.company or "",
                    job_content=job.post_content or "",
                )
                job.match_score = score
            except Exception as e:
                print(f"Scoring error for job {job.id}: {e}")

        db.commit()
    except Exception as e:
        print(f"_score_jobs_for_user error: {e}")
        db.rollback()
    finally:
        db.close()
