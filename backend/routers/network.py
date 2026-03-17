"""
Network intelligence: find hiring managers and alumni at target companies.
Uses DDG site:linkedin.com searches — no LinkedIn API required.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, List
import asyncio
import re

from backend.models.user import User
from backend.middleware.auth import get_current_user

router = APIRouter(prefix="/network", tags=["network"])


class HiringManagerRequest(BaseModel):
    company: str
    role: Optional[str] = None


class AlumniRequest(BaseModel):
    company: str
    university: str


def _ddgs_search(query: str, max_results: int = 8) -> list:
    try:
        from ddgs import DDGS
        ddgs = DDGS(timeout=15)
        return list(ddgs.text(query, max_results=max_results))
    except Exception as e:
        print(f"DDG network error: {e}")
        return []


def _extract_person(result: dict, company: str) -> dict:
    url = result.get("href", "")
    title = result.get("title", "")
    body = result.get("body", "")

    # Parse name from "First Last - Title at Company | LinkedIn"
    name = None
    job_title = None
    m = re.match(r"^([A-Z][a-zA-Z\-']+(?:\s+[A-Z][a-zA-Z\-']+){1,3})\s*[-–|]", title)
    if m:
        name = m.group(1).strip()
    m2 = re.search(r"[-–]\s*(.+?)\s*(?:at\s+\S|\||$)", title)
    if m2:
        raw = m2.group(1).strip()
        if len(raw) < 80 and not re.search(r"linkedin|profile|view", raw, re.I):
            job_title = raw

    # Extract location hint
    location = None
    loc_m = re.search(r"\b(New York|San Francisco|London|Berlin|Toronto|Austin|Seattle|Remote|NYC|SF)\b",
                      body, re.IGNORECASE)
    if loc_m:
        location = loc_m.group(1)

    return {
        "name": name or title.split(" - ")[0].strip(),
        "title": job_title,
        "company": company,
        "linkedin_url": url if "linkedin.com/in/" in url else None,
        "profile_url": url,
        "location": location,
        "snippet": body[:200],
    }


@router.post("/hiring-manager")
async def find_hiring_managers(
    payload: HiringManagerRequest,
    current_user: User = Depends(get_current_user),
):
    """Find hiring managers / EMs at a company via LinkedIn DDG search."""
    role_hint = payload.role or ""
    queries = [
        f'site:linkedin.com/in "{payload.company}" "Engineering Manager"',
        f'site:linkedin.com/in "{payload.company}" "VP Engineering" OR "VP of Engineering"',
        f'site:linkedin.com/in "{payload.company}" "Head of Engineering" OR "Director of Engineering"',
        f'site:linkedin.com/in "{payload.company}" "Hiring Manager" OR "Recruiter"',
        f'site:linkedin.com/in "{payload.company}" "Tech Lead" OR "Senior Manager"',
    ]
    if role_hint:
        queries.insert(0, f'site:linkedin.com/in "{payload.company}" "{role_hint}" manager OR lead')

    loop = asyncio.get_event_loop()
    tasks = [loop.run_in_executor(None, _ddgs_search, q, 6) for q in queries[:4]]
    results_all = await asyncio.gather(*tasks, return_exceptions=True)

    seen_urls: set = set()
    people = []
    for results in results_all:
        if not isinstance(results, list):
            continue
        for r in results:
            url = r.get("href", "")
            if url in seen_urls:
                continue
            if "linkedin.com" not in url:
                continue
            seen_urls.add(url)
            person = _extract_person(r, payload.company)
            if person["name"]:
                people.append(person)

    return {"company": payload.company, "hiring_managers": people[:15]}


@router.post("/alumni")
async def find_alumni(
    payload: AlumniRequest,
    current_user: User = Depends(get_current_user),
):
    """Find alumni from a university who work at a target company."""
    uni = payload.university
    company = payload.company

    queries = [
        f'site:linkedin.com/in "{company}" "{uni}"',
        f'site:linkedin.com/in "{company}" "{uni}" alumni',
        f'"{company}" "{uni}" alumni site:linkedin.com',
        f'"{company}" employees "{uni}" graduates linkedin',
    ]

    loop = asyncio.get_event_loop()
    tasks = [loop.run_in_executor(None, _ddgs_search, q, 8) for q in queries]
    results_all = await asyncio.gather(*tasks, return_exceptions=True)

    seen_urls: set = set()
    alumni = []
    for results in results_all:
        if not isinstance(results, list):
            continue
        for r in results:
            url = r.get("href", "")
            if url in seen_urls:
                continue
            if "linkedin.com" not in url:
                continue
            seen_urls.add(url)
            person = _extract_person(r, company)
            if person["name"]:
                alumni.append(person)

    return {"company": company, "university": uni, "alumni": alumni[:20]}
