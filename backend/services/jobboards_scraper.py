"""
Job board scraper: Greenhouse, Lever, Ashby, Workable, and other ATS platforms.

Strategy:
- Greenhouse & Lever: use their public APIs directly → real posting dates
- Others (Ashby, Workable, Rippling, Jobvite): DDG site: search + date enrichment via API
"""

import asyncio
import re
import time
from datetime import datetime, timezone, timedelta
from typing import Optional
import httpx


# ─── Shared helpers ──────────────────────────────────────────────────────────

def _preset_to_timelimit(date_preset):
    mapping = {"1h": "d", "24h": "d", "7d": "w", "30d": "m"}
    return mapping.get(date_preset or "", None)


_NON_ENGLISH_RE = re.compile(
    r"[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0600-\u06ff\u0400-\u04ff\u0900-\u097f]"
)
_JUNK_DOMAINS = re.compile(
    r"(pinterest\.|flickr\.|instagram\.|aliexpress\.|taobao\.|baidu\.|zhihu\.|csdn\.net|"
    r"gettyimages\.|shutterstock\.|istockphoto\.|alamy\.)",
    re.IGNORECASE,
)


def _ddgs_search(query: str, max_results: int = 10, timelimit=None, _retry: int = 2) -> list:
    for attempt in range(_retry):
        try:
            from ddgs import DDGS
            kwargs = {"max_results": max_results + 5, "region": "us-en"}
            if timelimit:
                kwargs["timelimit"] = timelimit
            ddgs = DDGS(timeout=15)
            raw = list(ddgs.text(query, **kwargs))
            # Filter out non-English and junk results
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


_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json",
}


# ─── Greenhouse API ───────────────────────────────────────────────────────────

async def _fetch_greenhouse_jobs(role: str, country: Optional[str], date_from: Optional[datetime],
                                  client: httpx.AsyncClient, known_slugs: list) -> list:
    """Fetch jobs directly from Greenhouse boards API for known companies."""
    jobs = []
    for slug in known_slugs:
        try:
            r = await client.get(
                f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs",
                params={"content": "true"},
                timeout=8,
            )
            if r.status_code != 200:
                continue
            for job in r.json().get("jobs", []):
                title = job.get("title", "")
                if not _role_matches(role, title):
                    continue
                first_pub = job.get("first_published")
                posted_at = _parse_iso(first_pub)
                if date_from and posted_at and posted_at < date_from:
                    continue
                loc = (job.get("location") or {}).get("name") or country
                url = job.get("absolute_url", f"https://boards.greenhouse.io/{slug}/jobs/{job.get('id')}")
                body = job.get("content", "") or ""
                jobs.append({
                    "title": title,
                    "company": job.get("company_name") or slug.replace("-", " ").title(),
                    "poster_name": None,
                    "poster_title": "Hiring Manager",
                    "poster_profile_url": None,
                    "poster_linkedin": None,
                    "post_url": url,
                    "platform": "jobboards",
                    "post_content": re.sub(r"<[^>]+>", " ", body)[:2000],
                    "posted_at": posted_at,
                    "location": loc,
                    "job_type": "full-time",
                    "is_remote": "remote" in (title + " " + (loc or "")).lower(),
                    "tags": [role, "greenhouse"] + _extract_skills(body),
                    "matched_role": role,
                    "salary_range": _extract_salary(body),
                })
        except Exception as e:
            print(f"Greenhouse API error for {slug}: {e}")
    return jobs


async def _enrich_greenhouse_url(url: str, client: httpx.AsyncClient) -> Optional[datetime]:
    """Get first_published for a specific Greenhouse job URL."""
    m = re.search(r"boards\.greenhouse\.io/([^/]+)/jobs/(\d+)", url)
    if not m:
        return None
    slug, job_id = m.group(1), m.group(2)
    try:
        r = await client.get(
            f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{job_id}",
            timeout=8,
        )
        if r.status_code == 200:
            return _parse_iso(r.json().get("first_published"))
    except Exception:
        pass
    return None


# ─── Lever API ────────────────────────────────────────────────────────────────

async def _enrich_lever_url(url: str, client: httpx.AsyncClient) -> Optional[datetime]:
    """Get createdAt for a specific Lever job URL."""
    m = re.search(r"jobs\.lever\.co/([^/]+)/([a-f0-9\-]{20,})", url)
    if not m:
        return None
    company, job_id = m.group(1), m.group(2)
    try:
        r = await client.get(
            f"https://api.lever.co/v0/postings/{company}/{job_id}",
            timeout=8,
        )
        if r.status_code == 200:
            created_ms = r.json().get("createdAt")
            if created_ms:
                return datetime.fromtimestamp(int(created_ms) / 1000, tz=timezone.utc)
    except Exception:
        pass
    return None


# ─── Main scraper ─────────────────────────────────────────────────────────────

# Popular Greenhouse companies (used for direct API calls)
GREENHOUSE_SLUGS = [
    "airbnb", "stripe", "databricks", "figma", "notion", "linear",
    "anthropic", "openai", "scale", "andurilindustries", "palantir",
    "cloudflare", "shopify", "discord", "ramp", "brex", "plaid",
    "deel", "checkr", "gusto", "amplitude", "mixpanel", "retool",
]

ALL_ATS = [
    ("greenhouse", "boards.greenhouse.io"),
    ("lever", "jobs.lever.co"),
    ("ashby", "jobs.ashbyhq.com"),
    ("workable", "apply.workable.com"),
    ("rippling", "ats.rippling.com"),
    ("jobvite", "jobs.jobvite.com"),
]


async def scrape_jobboard_jobs(
    roles: list,
    country=None,
    date_from=None,
    date_to=None,
    limit_per_platform: int = 10,
    date_preset=None,
) -> list:
    # Don't pass DDG timelimit — unreliable for ATS boards. Post-filter by date_from instead.
    per_query = max(10, limit_per_platform + 4)

    # Step 1: DDG discovery — finds role-relevant URLs across all ATS boards
    ddg_jobs = await asyncio.get_event_loop().run_in_executor(
        None, _ddg_discover_boards, roles[:3], country, None, per_query
    )

    # Step 2: Enrich with real posting dates via ATS public APIs
    enriched = await _enrich_ddg_jobs(ddg_jobs)

    # Filter by date if requested (normalize timezones before compare)
    if date_from:
        df = date_from if date_from.tzinfo else date_from.replace(tzinfo=timezone.utc)
        keep = []
        for j in enriched:
            pd = j.get("posted_at")
            if not pd:
                keep.append(j)  # keep unknowns
                continue
            if isinstance(pd, str):
                try:
                    pd = datetime.fromisoformat(pd)
                except Exception:
                    keep.append(j)
                    continue
            if pd.tzinfo is None:
                pd = pd.replace(tzinfo=timezone.utc)
            if pd >= df:
                keep.append(j)
        enriched = keep

    # Deduplicate
    seen = set()
    unique = []
    for job in enriched:
        uid = job.get("post_url", "")
        if uid and uid not in seen:
            seen.add(uid)
            unique.append(job)

    # Sort by date (newest first, undated last)
    unique.sort(
        key=lambda j: j.get("posted_at") or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return unique[:limit_per_platform * 3]


async def _enrich_ddg_jobs(jobs: list) -> list:
    """Fetch real posting dates for DDG-discovered ATS jobs."""
    async with httpx.AsyncClient(headers=_HEADERS, follow_redirects=True) as client:
        tasks = []
        for job in jobs:
            url = job.get("post_url", "")
            if "boards.greenhouse.io" in url:
                tasks.append(_enrich_greenhouse_url(url, client))
            elif "jobs.lever.co" in url:
                tasks.append(_enrich_lever_url(url, client))
            else:
                tasks.append(asyncio.sleep(0))  # placeholder

        dates = await asyncio.gather(*tasks, return_exceptions=True)

    enriched = []
    for job, dt in zip(jobs, dates):
        if isinstance(dt, datetime) and dt:
            job = {**job, "posted_at": dt}
        enriched.append(job)
    return enriched


def _ddg_discover_boards(roles: list, country, timelimit, per_query: int) -> list:
    """DDG searches for job board listings across all ATS platforms."""
    jobs = []
    country_q = f' "{country}"' if country else ""

    for role in roles:
        for platform_name, domain in ALL_ATS:
            queries = [
                f'site:{domain} "{role}"{country_q}',
            ]

            seen_urls: set = set()
            for query in queries:
                results = _ddgs_search(query, max_results=per_query, timelimit=timelimit)
                for r in results:
                    url = r.get("href", "")
                    if not url or url in seen_urls:
                        continue
                    if domain not in url:
                        continue
                    seen_urls.add(url)

                    title_raw = r.get("title", "")
                    body = r.get("body", "")
                    combined = f"{title_raw} {body}"
                    company = _extract_company_from_url(url)
                    clean_title = _clean_job_title(title_raw, role, company)

                    jobs.append({
                        "title": clean_title,
                        "company": company,
                        "poster_name": None,
                        "poster_title": "Hiring Manager",
                        "poster_profile_url": None,
                        "poster_linkedin": None,
                        "post_url": url,
                        "platform": "jobboards",
                        "post_content": combined[:2000],
                        "posted_at": _parse_date_hint(body),  # DDG hint (often None)
                        "location": _extract_location(combined),
                        "job_type": "full-time",
                        "is_remote": "remote" in combined.lower(),
                        "tags": [role, platform_name] + _extract_skills(combined),
                        "matched_role": role,
                        "salary_range": _extract_salary(combined),
                    })
                time.sleep(0.4)

    return jobs


# ─── Helpers ──────────────────────────────────────────────────────────────────

_SKIP_SLUGS = {"embed", "jobs", "apply", "search", "job", "careers", "listing", "board"}


def _extract_company_from_url(url: str) -> Optional[str]:
    """Extract company name from ATS URL path."""
    for domain in ["boards.greenhouse.io", "jobs.ashbyhq.com", "jobs.lever.co",
                   "apply.workable.com", "ats.rippling.com", "jobs.jobvite.com"]:
        if domain in url:
            path = url.split(domain, 1)[-1].lstrip("/")
            segments = re.split(r"[/?#]", path)
            for seg in segments:
                if seg and seg.lower() not in _SKIP_SLUGS and not seg.isdigit() and len(seg) > 1:
                    return seg.replace("-", " ").replace("_", " ").title()
            # Try ?for= param (Greenhouse embed)
            m = re.search(r"[?&]for=([^&]+)", url)
            if m:
                return m.group(1).replace("-", " ").replace("_", " ").title()
    return None


def _clean_job_title(title: str, role: str, company: Optional[str]) -> str:
    m = re.match(r"Job Application (?:for\s+)?(.+?)(?:\s+at\s+.+)?$", title, re.IGNORECASE)
    if m:
        return m.group(1).strip()[:120]
    if re.match(r"Jobs? at .+", title, re.IGNORECASE) and company:
        return f"{role.title()} at {company}"
    return title[:120] if title else f"{role.title()} at {company or 'Company'}"


def _role_matches(role: str, title: str) -> bool:
    role_words = [w for w in role.lower().split() if len(w) > 3]
    if not role_words:
        return True
    title_lower = title.lower()
    return any(w in title_lower for w in role_words)


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None


def _parse_date_hint(text: str) -> Optional[datetime]:
    if not text:
        return None
    now = datetime.now(timezone.utc)
    m = re.search(r"(\d+)\s*(hour|day|week|month)", text, re.IGNORECASE)
    if m:
        n, unit = int(m.group(1)), m.group(2).lower()
        if "hour" in unit: return now - timedelta(hours=n)
        if "day" in unit: return now - timedelta(days=n)
        if "week" in unit: return now - timedelta(weeks=n)
        if "month" in unit: return now - timedelta(days=n * 30)
    m2 = re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},\s+\d{4}", text)
    if m2:
        for fmt in ("%B %d, %Y", "%b %d, %Y"):
            try:
                return datetime.strptime(m2.group(0), fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                pass
    return None


def _extract_location(text: str) -> Optional[str]:
    m = re.search(
        r"\b(Remote|New York|San Francisco|London|Berlin|Austin|Seattle|Boston|Toronto|"
        r"NYC|SF|LA|Chicago|Miami|Denver|Singapore|Bangalore)\b",
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
