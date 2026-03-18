import re
import os
import json
import asyncio
import anthropic

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from backend.middleware.auth import get_current_user
from backend.models.database import get_db
from backend.models.job import Job
from backend.models.user import User

router = APIRouter(prefix="/salary", tags=["salary"])


def _parse_salary(raw: str) -> Optional[dict]:
    """Extract min/max salary numbers from raw string."""
    if not raw:
        return None
    raw = raw.replace(",", "").replace("$", "").lower()
    # Look for ranges like 120k-180k or 120000-180000
    m = re.search(r'(\d+\.?\d*)\s*k?\s*[-\u2013to]+\s*(\d+\.?\d*)\s*k?', raw)
    if m:
        lo, hi = float(m.group(1)), float(m.group(2))
        if lo < 1000:
            lo *= 1000
        if hi < 1000:
            hi *= 1000
        return {"min": int(lo), "max": int(hi), "mid": int((lo + hi) / 2)}
    # Single number
    m = re.search(r'(\d+\.?\d*)\s*k?', raw)
    if m:
        v = float(m.group(1))
        if v < 1000:
            v *= 1000
        return {"min": int(v), "max": int(v), "mid": int(v)}
    return None


@router.get("/intelligence")
def get_salary_intelligence(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregate salary data from scraped jobs."""
    jobs = (
        db.query(Job)
        .filter(
            Job.user_id == current_user.id,
            Job.salary_range != None,  # noqa: E711
            Job.salary_range != "",
        )
        .all()
    )

    data = []
    by_company = {}

    for j in jobs:
        parsed = _parse_salary(j.salary_range)
        if not parsed:
            continue
        entry = {
            "company": j.company or "Unknown",
            "role": j.title or "Unknown",
            "salary_raw": j.salary_range,
            "salary_min": parsed["min"],
            "salary_max": parsed["max"],
            "salary_mid": parsed["mid"],
            "location": j.location,
            "is_remote": j.is_remote,
            "job_id": j.id,
            "posted_at": j.posted_at.isoformat() if j.posted_at else None,
        }
        data.append(entry)

        company_key = (j.company or "Unknown").lower()
        if company_key not in by_company:
            by_company[company_key] = []
        by_company[company_key].append(parsed["mid"])

    # Sort by salary desc
    data.sort(key=lambda x: x["salary_mid"], reverse=True)

    # Company averages
    company_avgs = [
        {"company": k.title(), "avg_salary": round(sum(v) / len(v))}
        for k, v in by_company.items()
        if v
    ]
    company_avgs.sort(key=lambda x: x["avg_salary"], reverse=True)

    overall_mids = [d["salary_mid"] for d in data]

    return {
        "entries": data[:100],  # cap at 100
        "company_averages": company_avgs[:20],
        "stats": {
            "count": len(data),
            "avg": round(sum(overall_mids) / len(overall_mids)) if overall_mids else 0,
            "median": sorted(overall_mids)[len(overall_mids) // 2] if overall_mids else 0,
            "max": max(overall_mids) if overall_mids else 0,
            "min": min(overall_mids) if overall_mids else 0,
        },
    }


class SalaryResearchRequest(BaseModel):
    role: str
    company: Optional[str] = None
    location: Optional[str] = None
    level: Optional[str] = None  # junior/mid/senior/staff/principal


def _ddgs_search_sync(query: str, max_results: int = 5) -> list:
    """Synchronous DuckDuckGo search returning snippet strings."""
    try:
        from ddgs import DDGS
        ddgs = DDGS(timeout=15)
        results = list(ddgs.text(query, max_results=max_results))
        return [
            f"[{r.get('title', '')}]: {r.get('body', '')[:300]}"
            for r in results
            if r.get("body")
        ]
    except Exception as e:
        print(f"DDG salary search error: {e}")
        return []


@router.post("/research")
async def research_salary(
    payload: SalaryResearchRequest,
    current_user: User = Depends(get_current_user),
):
    """Use DDG + Claude to research salary for a role."""
    query = (
        f"{payload.role} salary "
        f"{payload.company or ''} "
        f"{payload.level or ''} "
        f"{payload.location or ''} "
        f"2025 range"
    )

    loop = asyncio.get_event_loop()
    snippets = await loop.run_in_executor(None, _ddgs_search_sync, query, 5)

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        messages=[{
            "role": "user",
            "content": (
                f"Based on these search results, provide salary intelligence for:\n"
                f"Role: {payload.role}\n"
                f"Company: {payload.company or 'General market'}\n"
                f"Level: {payload.level or 'Not specified'}\n"
                f"Location: {payload.location or 'US'}\n\n"
                f"Search results:\n"
                f"{chr(10).join(snippets[:5])}\n\n"
                f'Return JSON only: {{"range_low": <int>, "range_high": <int>, "median": <int>, '
                f'"currency": "USD", "notes": "<30 words of context>", "negotiation_tip": "<20 words>"}}'
            ),
        }],
    )

    text = resp.content[0].text.strip()
    m = re.search(r'\{.*\}', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return {"error": "Could not parse salary data"}
