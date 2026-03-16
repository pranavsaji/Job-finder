"""
Job board scraper: Greenhouse, Ashby, Workable, Lever, and other ATS platforms.
Uses DDG site: searches to find direct ATS job postings — no API keys needed.
"""

import asyncio
import re
import time
from datetime import datetime, timezone, timedelta
from typing import Optional


def _ddgs_search(query: str, max_results: int = 10, timelimit=None) -> list:
    try:
        from ddgs import DDGS
        kwargs = {"max_results": max_results}
        if timelimit:
            kwargs["timelimit"] = timelimit
        ddgs = DDGS(timeout=15)
        return list(ddgs.text(query, **kwargs))
    except Exception as e:
        print(f"DDG search error for '{query[:60]}': {e}")
        return []


def _preset_to_timelimit(date_preset):
    mapping = {"1h": "d", "24h": "d", "7d": "w", "30d": "m"}
    return mapping.get(date_preset or "", None)


async def scrape_jobboard_jobs(
    roles: list,
    country=None,
    date_from=None,
    date_to=None,
    limit_per_platform: int = 10,
    date_preset=None,
) -> list:
    timelimit = _preset_to_timelimit(date_preset)
    per_query = max(8, limit_per_platform // 2 + 4)

    tasks = [
        asyncio.get_event_loop().run_in_executor(None, _scrape_board_sync, role, country, timelimit, per_query)
        for role in roles[:3]
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_jobs = []
    for r in results:
        if isinstance(r, list):
            all_jobs.extend(r)

    seen = set()
    unique = []
    for job in all_jobs:
        uid = job.get("post_url", "")
        if uid and uid not in seen:
            seen.add(uid)
            unique.append(job)

    return unique[:limit_per_platform * 3]


ATS_SITES = [
    ("greenhouse", "boards.greenhouse.io"),
    ("ashby", "jobs.ashbyhq.com"),
    ("workable", "apply.workable.com"),
    ("lever", "jobs.lever.co"),
    ("rippling", "ats.rippling.com"),
    ("jobvite", "jobs.jobvite.com"),
]


def _scrape_board_sync(role: str, country, timelimit, per_query: int = 8) -> list:
    jobs = []
    country_q = f' "{country}"' if country else ""

    for platform_name, domain in ATS_SITES:
        queries = [
            f'site:{domain} "{role}"{country_q}',
            f'site:{domain} "{role}" engineer{country_q}' if "engineer" not in role.lower() else f'site:{domain} "{role}"',
        ]
        for query in queries:
            results = _ddgs_search(query, max_results=per_query, timelimit=timelimit)
            for r in results:
                url = r.get("href", "")
                if not url or domain not in url:
                    continue
                title = r.get("title", "")
                body = r.get("body", "")
                combined = f"{title} {body}"
                company = _extract_company_from_url(url, domain)
                jobs.append({
                    "title": title[:120] or f"{role} at {company}",
                    "company": company,
                    "poster_name": None,
                    "poster_title": "Hiring Manager",
                    "poster_profile_url": None,
                    "poster_linkedin": None,
                    "post_url": url,
                    "platform": "jobboards",
                    "post_content": combined[:2000],
                    "posted_at": _parse_date_hint(body),
                    "location": _extract_location(combined),
                    "job_type": "full-time",
                    "is_remote": "remote" in combined.lower(),
                    "tags": [role, platform_name] + _extract_skills(combined),
                    "matched_role": role,
                    "salary_range": _extract_salary(combined),
                })
            time.sleep(0.4)

    return jobs


def _extract_company_from_url(url: str, domain: str) -> Optional[str]:
    # Extract company slug from URL: boards.greenhouse.io/COMPANY/jobs/...
    m = re.search(rf"{re.escape(domain)}/([^/?\s]+)", url)
    if m:
        slug = m.group(1)
        # Convert slug to readable name: my-company -> My Company
        return slug.replace("-", " ").replace("_", " ").title()
    return None


def _extract_location(text: str) -> Optional[str]:
    m = re.search(
        r"\b(Remote|New York|San Francisco|London|Berlin|Austin|Seattle|Boston|Toronto|NYC|SF|LA|Chicago|Miami|Denver|Bangalore|Singapore)\b",
        text, re.IGNORECASE
    )
    return m.group(1) if m else None


def _extract_salary(text: str) -> Optional[str]:
    m = re.search(r"\$[\d,]+k?\s*(?:[-to]+)\s*\$[\d,]+k?|\$\d+[kKmM]", text, re.IGNORECASE)
    return m.group(0) if m else None


def _extract_skills(text: str) -> list:
    skills = ["Python", "React", "TypeScript", "JavaScript", "Go", "Rust", "Java",
              "Kubernetes", "AWS", "GCP", "SQL", "Machine Learning", "AI", "LLM",
              "Node.js", "FastAPI", "Django", "Swift", "Kotlin", "C++"]
    return [s for s in skills if re.search(r"\b" + re.escape(s) + r"\b", text, re.IGNORECASE)][:4]


def _parse_date_hint(text: str) -> Optional[str]:
    if not text:
        return None
    now = datetime.now(timezone.utc)
    m = re.search(r"(\d+)\s*(hour|day|week|month)", text, re.IGNORECASE)
    if m:
        n, unit = int(m.group(1)), m.group(2).lower()
        if "hour" in unit: return (now - timedelta(hours=n)).isoformat()
        if "day" in unit: return (now - timedelta(days=n)).isoformat()
        if "week" in unit: return (now - timedelta(weeks=n)).isoformat()
        if "month" in unit: return (now - timedelta(days=n*30)).isoformat()
    m2 = re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},\s+\d{4}", text)
    if m2:
        for fmt in ("%B %d, %Y", "%b %d, %Y"):
            try:
                return datetime.strptime(m2.group(0), fmt).replace(tzinfo=timezone.utc).isoformat()
            except ValueError:
                pass
    return None
