"""
Wellfound (AngelList) scraper.
Uses DDG site:wellfound.com/jobs and site:wellfound.com/company searches.
Only returns actual job listing URLs — filters out homepage, landing, and signup pages.
"""

import asyncio
import re
import time
from datetime import datetime, timezone, timedelta
from typing import Optional


_NON_ENGLISH_RE = re.compile(
    r"[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0600-\u06ff\u0400-\u04ff\u0900-\u097f]"
)
_JUNK_DOMAINS = re.compile(
    r"(pinterest\.|flickr\.|instagram\.|aliexpress\.|taobao\.|baidu\.|zhihu\.|csdn\.net|gettyimages\.|shutterstock\.)",
    re.IGNORECASE,
)

# Wellfound pages that are NOT job listings (homepage, landing pages, etc.)
_WELLFOUND_JUNK_PATH_RE = re.compile(
    r"wellfound\.com/?($|"
    r"\?|"
    r"jobs/?$|"           # generic /jobs root (search page)
    r"discover|"
    r"remote/?$|"         # /remote landing page
    r"signup|"
    r"login|"
    r"candidates|"
    r"user/|"
    r"blog|"
    r"about|"
    r"terms|"
    r"privacy|"
    r"press|"
    r"company/?$|"        # bare /company root
    r"markets|"
    r"newsletters|"
    r"startups/?$"
    r")",
    re.IGNORECASE,
)

# Only these URL patterns are actual job listings
_WELLFOUND_JOB_PATH_RE = re.compile(
    r"wellfound\.com/(company/[^/?#]+/jobs/[^/?#]+|l/jobs/[^/?#]+|jobs/[^/?#].+)",
    re.IGNORECASE,
)


def _is_real_wellfound_job(url: str) -> bool:
    if not url or "wellfound.com" not in url:
        return False
    if _WELLFOUND_JUNK_PATH_RE.search(url):
        return False
    return bool(_WELLFOUND_JOB_PATH_RE.search(url))


def _ddgs_search(query: str, max_results: int = 10, timelimit=None, _retry: int = 2) -> list:
    for attempt in range(_retry):
        try:
            from ddgs import DDGS
            kwargs = {"max_results": max_results + 5, "region": "us-en"}
            if timelimit:
                kwargs["timelimit"] = timelimit
            ddgs = DDGS(timeout=15)
            raw = list(ddgs.text(query, **kwargs))
            results = [r for r in raw
                       if not _NON_ENGLISH_RE.search(r.get("title", "") + r.get("body", "")[:80])
                       and not _JUNK_DOMAINS.search(r.get("href", ""))]
            out = results[:max_results] if results else raw[:max_results]
            if out:
                return out
        except Exception as e:
            print(f"DDG search error (attempt {attempt+1}) for '{query[:60]}': {e}")
            if attempt < _retry - 1:
                time.sleep(1.5)
    return []


def _preset_to_timelimit(date_preset: Optional[str]) -> Optional[str]:
    mapping = {"1h": "d", "24h": "d", "7d": "w", "30d": "m"}
    return mapping.get(date_preset or "", None)


async def scrape_wellfound_jobs(
    roles: list,
    country: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    limit_per_platform: int = 10,
    date_preset: Optional[str] = None,
) -> list:
    """Search Wellfound for startup jobs via DDG."""
    # Don't use DDG timelimit — too unreliable. Post-filter by date_from instead.
    per_query = max(10, limit_per_platform + 5)

    tasks = [
        asyncio.get_event_loop().run_in_executor(
            None, _search_wellfound_sync, role, country, None, per_query
        )
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

    # Post-filter by date_from if provided
    if date_from:
        filtered = []
        for job in unique:
            pd = job.get("posted_at")
            if pd is None:
                filtered.append(job)  # keep unknowns
                continue
            try:
                if isinstance(pd, str):
                    pd = datetime.fromisoformat(pd)
                if pd.tzinfo is None:
                    pd = pd.replace(tzinfo=timezone.utc)
                df = date_from if date_from.tzinfo else date_from.replace(tzinfo=timezone.utc)
                if pd >= df:
                    filtered.append(job)
            except Exception:
                filtered.append(job)
        unique = filtered

    return unique[:limit_per_platform * 2]


def _search_wellfound_sync(
    role: str,
    country: Optional[str],
    timelimit: Optional[str],
    per_query: int = 10,
) -> list:
    jobs = []
    country_q = f' "{country}"' if country else ""
    year_q = " 2025 OR 2026"

    # Use specific subpath queries so DDG only returns actual job pages
    queries = [
        f'site:wellfound.com/company "{role}"{country_q}',
        f'site:wellfound.com/jobs "{role}"{country_q}{year_q}',
        f'wellfound.com/company "{role}" hiring{country_q}{year_q}',
    ]

    seen_urls: set = set()
    for query in queries:
        results = _ddgs_search(query, max_results=per_query, timelimit=timelimit)
        for r in results:
            url = r.get("href", "")
            if not _is_real_wellfound_job(url):
                continue
            if url in seen_urls:
                continue
            seen_urls.add(url)

            title = r.get("title", "")
            body = r.get("body", "")
            combined = f"{title} {body}"

            company = _extract_company_from_wf_url(url) or _extract_company_from_text(combined)

            jobs.append({
                "title": _extract_role(title, role),
                "company": company,
                "poster_name": None,
                "poster_title": "Hiring Manager",
                "poster_profile_url": None,
                "poster_linkedin": None,
                "post_url": url,
                "platform": "wellfound",
                "post_content": combined[:2000],
                "posted_at": _parse_date_hint(body),
                "location": _extract_location(combined),
                "job_type": _extract_job_type(combined),
                "is_remote": "remote" in combined.lower(),
                "tags": [role] + _extract_skills(combined),
                "matched_role": role,
                "salary_range": _extract_salary(combined),
            })
        time.sleep(0.4)

    return jobs


def _extract_company_from_wf_url(url: str) -> Optional[str]:
    # wellfound.com/company/slug/jobs/... or wellfound.com/l/jobs/slug or wellfound.com/jobs/role-at-company
    m = re.search(r"wellfound\.com/company/([^/?#]+)/jobs/", url)
    if m:
        return m.group(1).replace("-", " ").title()
    m2 = re.search(r"wellfound\.com/(?:l/)?jobs/[^/?#]*-at-([a-z0-9-]+)", url)
    if m2:
        return m2.group(1).replace("-", " ").title()
    return None


def _extract_company_from_text(text: str) -> Optional[str]:
    patterns = [
        r"at\s+([A-Za-z][A-Za-z0-9\s&.]+?)\s+[•·]",
        r"at\s+([A-Z][A-Za-z0-9\s&.]+?)(?:\s+is|\s+-|\.|,|!|\n|$)",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            c = m.group(1).strip()
            if 1 <= len(c.split()) <= 5 and c not in ("Wellfound", "AngelList", "Startup"):
                return c
    return None


def _extract_role(text: str, fallback: str) -> str:
    # Strip " - Wellfound" or " | Wellfound" or " at Company - Wellfound" suffix
    text = re.sub(r"\s*[\|\-]\s*Wellfound.*$", "", text, flags=re.IGNORECASE).strip()
    # Also strip trailing " at Company Name" for cleaner title
    text = re.sub(r"\s+at\s+[A-Z][A-Za-z0-9\s&.]+$", "", text).strip()
    if text and len(text) > 3:
        return text[:120]
    return fallback.title()


def _extract_location(text: str) -> Optional[str]:
    m = re.search(
        r"\b(Remote|New York|San Francisco|London|Berlin|Austin|Seattle|Boston|Toronto|NYC|SF|LA|Chicago|Miami|Denver|Singapore|Bangalore)\b",
        text, re.IGNORECASE
    )
    return m.group(1) if m else None


def _extract_job_type(text: str) -> Optional[str]:
    tl = text.lower()
    if "contract" in tl or "freelance" in tl:
        return "contract"
    if "part-time" in tl or "part time" in tl:
        return "part-time"
    if "internship" in tl or "intern" in tl:
        return "internship"
    return "full-time"


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
        if "month" in unit: return (now - timedelta(days=n * 30)).isoformat()
    m2 = re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},\s+\d{4}", text)
    if m2:
        for fmt in ("%B %d, %Y", "%b %d, %Y"):
            try:
                return datetime.strptime(m2.group(0), fmt).replace(tzinfo=timezone.utc).isoformat()
            except ValueError:
                pass
    return None
