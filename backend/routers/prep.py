import asyncio
import json
import os
from typing import Any, Dict, List, Optional

import anthropic
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.middleware.auth import get_current_user
from backend.models.user import User
from backend.services.prep_service import _ddgs_search

router = APIRouter(prefix="/prep", tags=["prep"])


class PrepRequest(BaseModel):
    company: str
    role: str
    job_description: Optional[str] = None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    company: str
    role: str
    job_description: Optional[str] = None
    pack: Dict[str, Any]
    messages: List[ChatMessage]
    message: str


_FRESH_INFO_KEYWORDS = {
    "latest", "recent", "2025", "2026", "specific", "example",
    "leetcode", "salary", "compensation", "news", "today", "current",
}


def _needs_search(question: str) -> bool:
    lower = question.lower()
    return any(kw in lower for kw in _FRESH_INFO_KEYWORDS)


def _pack_to_text(pack: Dict[str, Any]) -> str:
    lines = []
    if pack.get("process"):
        lines.append(f"INTERVIEW PROCESS:\n{pack['process']}")
    if pack.get("rounds"):
        lines.append("ROUNDS:\n" + "\n".join(f"  {r}" for r in pack["rounds"]))
    if pack.get("technical_focus"):
        lines.append("TECHNICAL FOCUS AREAS:\n" + "\n".join(f"  - {t}" for t in pack["technical_focus"]))
    if pack.get("likely_questions"):
        lines.append("LIKELY INTERVIEW QUESTIONS:\n" + "\n".join(f"  Q{i+1}. {q}" for i, q in enumerate(pack["likely_questions"])))
    if pack.get("culture_notes"):
        lines.append(f"CULTURE & VALUES:\n{pack['culture_notes']}")
    if pack.get("salary_range"):
        lines.append(f"SALARY RANGE:\n{pack['salary_range']}")
    if pack.get("questions_to_ask"):
        lines.append("QUESTIONS TO ASK INTERVIEWER:\n" + "\n".join(f"  - {q}" for q in pack["questions_to_ask"]))
    if pack.get("prep_tips"):
        lines.append("PREP TIPS:\n" + "\n".join(f"  - {t}" for t in pack["prep_tips"]))
    if pack.get("red_flags"):
        lines.append(f"POTENTIAL RED FLAGS:\n{pack['red_flags']}")
    return "\n\n".join(lines)


async def _chat_stream_generator(payload: ChatRequest):
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    loop = asyncio.get_event_loop()

    # Optionally run a quick DDG search for fresh info
    search_context = ""
    if _needs_search(payload.message):
        queries = [
            f'"{payload.company}" {payload.role} interview {payload.message[:80]} 2025',
        ]
        if any(kw in payload.message.lower() for kw in ("leetcode", "coding", "algorithm")):
            queries.append(f'site:leetcode.com discuss "{payload.company}" {payload.role}')
        elif any(kw in payload.message.lower() for kw in ("salary", "compensation", "pay")):
            queries.append(f'"{payload.company}" "{payload.role}" salary 2025 levels.fyi')

        results = await asyncio.gather(
            *[loop.run_in_executor(None, _ddgs_search, q, 3) for q in queries[:2]],
            return_exceptions=True,
        )
        snippets = []
        for res in results:
            if isinstance(res, list):
                for r in res:
                    if r.get("body"):
                        snippets.append(f"- [{r.get('title', '')}]: {r.get('body', '')[:200]}")
        if snippets:
            search_context = "\n\nFRESH SEARCH RESULTS (use if relevant):\n" + "\n".join(snippets[:6])

    pack_text = _pack_to_text(payload.pack)
    jd_section = f"\n\nJOB DESCRIPTION:\n{payload.job_description[:1500]}" if payload.job_description else ""

    system_prompt = f"""You are an expert interview coach helping a candidate prepare for a {payload.role} interview at {payload.company}.

You have deep knowledge of the company's hiring process, culture, and technical expectations based on the prep pack below. Give specific, actionable, direct advice. Be concise but thorough. Use bullet points where helpful.

PREP PACK FOR {payload.company.upper()} — {payload.role.upper()}:
{pack_text}{jd_section}{search_context}

When asked for mock interview questions, give realistic questions in the style of {payload.company}. When asked for answers, give structured STAR-method guidance. When discussing LeetCode or coding topics, be specific about patterns and difficulty. Always tie advice back to what {payload.company} specifically values."""

    messages = [{"role": m.role, "content": m.content} for m in payload.messages]
    messages.append({"role": "user", "content": payload.message})

    def _stream():
        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=system_prompt,
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield text

    try:
        for chunk in _stream():
            # Escape newlines in the SSE data field so each event stays on one logical line
            safe_chunk = chunk.replace("\n", "\\n")
            yield f"data: {safe_chunk}\n\n"
    except Exception as e:
        yield f"data: [ERROR] {str(e)}\n\n"
    finally:
        yield "data: [DONE]\n\n"


@router.post("/generate")
async def generate_prep_pack(
    payload: PrepRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate a full interview prep pack for a company + role."""
    from backend.services.prep_service import generate_prep_pack
    pack = await generate_prep_pack(
        company=payload.company,
        role=payload.role,
        job_description=payload.job_description or "",
    )
    return {"company": payload.company, "role": payload.role, "pack": pack}


@router.post("/chat")
async def chat(
    payload: ChatRequest,
    current_user: User = Depends(get_current_user),
):
    """Stream an interview coach response via SSE."""
    return StreamingResponse(
        _chat_stream_generator(payload),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
