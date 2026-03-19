"""
Mock interview router.

POST /mock/start         — create session, research company, return opening question
POST /mock/chat          — SSE stream, strict on-topic interviewer
POST /mock/evaluate      — evaluate completed session, return scores
GET  /mock/sessions      — list past sessions
GET  /mock/sessions/{id} — get session details
DELETE /mock/sessions/{id}
"""
import asyncio
import datetime
import json
import os
from typing import Any, Dict, List, Optional

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.middleware.auth import get_current_user
from backend.models.database import get_db
from backend.models.mock_session import MockSession
from backend.models.user import User
from backend.services.mock_interview_service import (
    build_system_prompt,
    evaluate_session,
    generate_opening_message,
    research_interview_context,
)

router = APIRouter(prefix="/mock", tags=["mock"])


# ── Request models ─────────────────────────────────────────────────────────

class StartRequest(BaseModel):
    company: str
    role: str
    interview_type: str
    difficulty: str = "medium"
    job_id: Optional[int] = None
    job_description: Optional[str] = None


class ChatRequest(BaseModel):
    session_id: int
    message: str
    code: Optional[str] = None   # for coding rounds


class EvaluateRequest(BaseModel):
    session_id: int
    speech_metrics: Dict[str, Any] = {}
    cheat_flags: Dict[str, Any] = {}


# ── Helpers ────────────────────────────────────────────────────────────────

def _get_session(db: Session, session_id: int, user_id: int) -> MockSession:
    sess = (
        db.query(MockSession)
        .filter(MockSession.id == session_id, MockSession.user_id == user_id)
        .first()
    )
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    return sess


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/start")
async def start_session(
    payload: StartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a session, run research agent, return the AI's opening message."""
    import functools

    try:
        research = await research_interview_context(
            payload.company, payload.role, payload.interview_type
        )
    except Exception as e:
        print(f"Research failed (non-fatal): {e}")
        research = ""

    loop = asyncio.get_event_loop()
    opening = await loop.run_in_executor(
        None,
        functools.partial(
            generate_opening_message,
            company=payload.company,
            role=payload.role,
            interview_type=payload.interview_type,
            difficulty=payload.difficulty,
            research_context=research,
            resume_text=current_user.resume_text,
            job_description=payload.job_description,
        ),
    )

    ts = datetime.datetime.utcnow().isoformat()
    initial_messages = [{"role": "assistant", "content": opening, "ts": ts}]

    try:
        session = MockSession(
            user_id=current_user.id,
            job_id=payload.job_id,
            company=payload.company,
            role=payload.role,
            interview_type=payload.interview_type,
            difficulty=payload.difficulty,
            job_description=payload.job_description,
            resume_snapshot=current_user.resume_text,
            research_context=research,
            messages=initial_messages,
            status="active",
        )
        db.add(session)
        db.commit()
        db.refresh(session)
    except Exception as e:
        db.rollback()
        print(f"MockSession create error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create session: {str(e)}")

    return {
        "session_id": session.id,
        "opening": opening,
        "research_summary": research[:300] if research else None,
    }


async def _chat_generator(
    session_id: int,
    user_id: int,
    user_message: str,
    code_snippet: Optional[str],
):
    """SSE generator for a single turn in the mock interview."""
    from backend.models.database import SessionLocal

    db = SessionLocal()
    try:
        sess = db.query(MockSession).filter(
            MockSession.id == session_id, MockSession.user_id == user_id
        ).first()
        if not sess:
            yield "data: [ERROR] Session not found\n\n"
            yield "data: [DONE:False]\n\n"
            return

        if sess.status != "active":
            yield "data: [ERROR] Session is not active\n\n"
            yield "data: [DONE:False]\n\n"
            return

        messages = list(sess.messages or [])
        ts = datetime.datetime.utcnow().isoformat()

        # Append user turn (include code if coding round)
        content = user_message
        if code_snippet and sess.interview_type == "coding":
            content = f"{user_message}\n\n[CODE SUBMITTED]\n```\n{code_snippet}\n```"

        messages.append({"role": "user", "content": content, "ts": ts})

        system = build_system_prompt(
            company=sess.company,
            role=sess.role,
            interview_type=sess.interview_type,
            difficulty=sess.difficulty,
            research_context=sess.research_context or "",
            resume_text=sess.resume_snapshot,
            job_description=sess.job_description,
        )

        # Cap at last 30 messages to keep Claude API payload manageable
        recent_messages = messages[-30:]
        api_messages = [
            {"role": m["role"], "content": m["content"]}
            for m in recent_messages
        ]
    finally:
        db.close()

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    full_response = ""

    def _stream():
        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=600,
            system=system,
            messages=api_messages,
        ) as stream:
            for text in stream.text_stream:
                yield text

    try:
        for chunk in _stream():
            full_response += chunk
            safe = chunk.replace("\n", "\\n")
            yield f"data: {safe}\n\n"
    except Exception as e:
        yield f"data: [ERROR] {str(e)}\n\n"
        yield "data: [DONE]\n\n"
        return

    # Persist assistant response to DB
    db2 = SessionLocal()
    try:
        sess2 = db2.query(MockSession).filter(MockSession.id == session_id).first()
        if sess2:
            msgs = list(sess2.messages or [])
            msgs.append({"role": "user", "content": content, "ts": ts})
            msgs.append({
                "role": "assistant",
                "content": full_response,
                "ts": datetime.datetime.utcnow().isoformat(),
            })
            sess2.messages = msgs
            db2.commit()
    except Exception:
        pass
    finally:
        db2.close()

    # Signal whether interview is complete
    is_complete = "[INTERVIEW_COMPLETE]" in full_response
    yield f"data: [DONE:{is_complete}]\n\n"


@router.post("/chat")
async def chat(
    payload: ChatRequest,
    current_user: User = Depends(get_current_user),
):
    """Stream one interview turn. Detects [INTERVIEW_COMPLETE] to auto-end."""
    return StreamingResponse(
        _chat_generator(
            session_id=payload.session_id,
            user_id=current_user.id,
            user_message=payload.message,
            code_snippet=payload.code,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/evaluate")
def evaluate(
    payload: EvaluateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run post-interview evaluation and persist results."""
    sess = _get_session(db, payload.session_id, current_user.id)

    # Idempotency: return cached result if already evaluated
    if sess.status == "completed" and sess.evaluation:
        return sess.evaluation

    result = evaluate_session(
        company=sess.company,
        role=sess.role,
        interview_type=sess.interview_type,
        difficulty=sess.difficulty,
        messages=sess.messages or [],
        speech_metrics=payload.speech_metrics,
        cheat_flags=payload.cheat_flags,
        resume_text=sess.resume_snapshot,
    )

    sess.evaluation = result
    sess.speech_metrics = payload.speech_metrics
    sess.cheat_flags = payload.cheat_flags
    sess.status = "completed"
    sess.ended_at = datetime.datetime.utcnow()
    db.commit()

    return result


@router.post("/abandon/{session_id}")
def abandon_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sess = _get_session(db, session_id, current_user.id)
    sess.status = "abandoned"
    sess.ended_at = datetime.datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.get("/sessions")
def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sessions = (
        db.query(MockSession)
        .filter(MockSession.user_id == current_user.id)
        .order_by(MockSession.started_at.desc())
        .limit(50)
        .all()
    )
    return {"sessions": [
        {
            "id": s.id,
            "company": s.company,
            "role": s.role,
            "interview_type": s.interview_type,
            "difficulty": s.difficulty,
            "status": s.status,
            "verdict": (s.evaluation or {}).get("verdict"),
            "overall_score": (s.evaluation or {}).get("overall_score"),
            "started_at": s.started_at.isoformat() if s.started_at else None,
        }
        for s in sessions
    ]}


@router.get("/sessions/{session_id}")
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sess = _get_session(db, session_id, current_user.id)
    return sess.to_dict()


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sess = _get_session(db, session_id, current_user.id)
    db.delete(sess)
    db.commit()
    return {"deleted": session_id}


# ── Code Execution ──────────────────────────────────────────────────────────

class ExecuteCodeRequest(BaseModel):
    language: str
    code: str
    stdin: str = ""


@router.post("/execute")
async def execute_code_endpoint(
    payload: ExecuteCodeRequest,
    current_user: User = Depends(get_current_user),
):
    """Execute code via Piston API and return stdout/stderr/exit_code."""
    from backend.services.code_runner import execute_code
    result = await execute_code(payload.language, payload.code, payload.stdin)
    return result


# ── Analytics ───────────────────────────────────────────────────────────────

@router.get("/analytics")
def get_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return performance trends across all completed sessions."""
    sessions = (
        db.query(MockSession)
        .filter(MockSession.user_id == current_user.id, MockSession.status == "completed")
        .order_by(MockSession.started_at.asc())
        .all()
    )

    trends = []
    by_type: Dict[str, List[Any]] = {}

    for s in sessions:
        if not s.evaluation:
            continue
        ev = s.evaluation
        scores = ev.get("scores", {})
        entry = {
            "id": s.id,
            "company": s.company,
            "role": s.role,
            "interview_type": s.interview_type,
            "difficulty": s.difficulty,
            "verdict": ev.get("verdict"),
            "overall_score": ev.get("overall_score"),
            "scores": scores,
            "started_at": s.started_at.isoformat() if s.started_at else None,
        }
        trends.append(entry)

        t = s.interview_type
        if t not in by_type:
            by_type[t] = []
        by_type[t].append(ev.get("overall_score", 0))

    # Averages per type
    avg_by_type = {t: round(sum(v) / len(v)) for t, v in by_type.items()}

    # Overall avg
    all_scores = [e["overall_score"] for e in trends if e["overall_score"]]
    overall_avg = round(sum(all_scores) / len(all_scores)) if all_scores else 0

    return {
        "trends": trends,
        "avg_by_type": avg_by_type,
        "overall_avg": overall_avg,
        "total_sessions": len(trends),
        "pass_rate": (
            round(
                len([e for e in trends if e["verdict"] == "pass"]) / len(trends) * 100
            )
            if trends
            else 0
        ),
    }
