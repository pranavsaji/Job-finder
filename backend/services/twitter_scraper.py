"""
Twitter/X hiring post scraper.
Uses DDG site:twitter.com search to find hiring tweets from founders/managers.
Nitter instances are unreliable; DDG is the stable fallback.
"""

import asyncio
import re
import time
from datetime import datetime, timezone, timedelta
from typing import Optional


def _ddgs_search(query: str, max_results: int = 10, timelimit: Optional[str] = None) -> list:
    try:
        from ddgs import DDGS
        kwargs = {"max_results": max_results}
        if timelimit:
            kwargs["timelimit"] = timelimit
        ddgs = DDGS(timeout=15)
        results = list(ddgs.text(query, **kwargs))
        return results
    except Exception as e:
        print(f"DDG search error for '{query[:60]}': {e}")
        return []


def _preset_to_timelimit(date_preset: Optional[str]) -> Optional[str]:
    mapping = {"1h": "d", "24h": "d", "7d": "w", "30d": "m"}
    return mapping.get(date_preset or "", None)


async def scrape_twitter_jobs(
    roles: list,
    country: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    limit_per_platform: int = 10,
    date_preset: Optional[str] = None,
) -> list:
    """Search Twitter/X for hiring posts via DuckDuckGo site: search."""
    timelimit = _preset_to_timelimit(date_preset)
    per_query = max(5, (limit_per_platform // 2) + 2)
    all_jobs = []

    for role in roles[:3]:
        jobs = await asyncio.get_event_loop().run_in_executor(
            None, _search_twitter_posts_sync, role, country, timelimit, per_query
        )
        all_jobs.extend(jobs)
        await asyncio.sleep(1.5)

    seen = set()
    unique = []
    for job in all_jobs:
        uid = job.get("post_url", "")
        if uid and uid not in seen:
            seen.add(uid)
            unique.append(job)

    return unique


def _search_twitter_posts_sync(
    role: str,
    country: Optional[str],
    timelimit: Optional[str] = None,
    per_query: int = 6,
) -> list:
    jobs = []
    country_q = f' "{country}"' if country else ""

    queries = [
        f'site:twitter.com "we are hiring" "{role}"{country_q}',
        f'site:twitter.com "my team is hiring" "{role}"{country_q}',
        f'site:twitter.com "hiring" "{role}" ("dm me" OR "apply" OR "join us"){country_q}',
        f'site:x.com "we are hiring" "{role}"{country_q}',
        f'twitter.com "hiring" "{role}" 2025 OR 2026{country_q}',
        f'x.com "we\'re hiring" "{role}"{country_q}',
    ]

    seen_urls: set = set()

    for query in queries:
        results = _ddgs_search(query, max_results=per_query, timelimit=timelimit)
        for r in results:
            url = r.get("href", "")
            if not url:
                continue
            # Normalize x.com -> twitter.com
            url = url.replace("https://x.com/", "https://twitter.com/")
            if "twitter.com" not in url and "x.com" not in url:
                continue
            # Accept tweet URLs and profile-level hiring posts
            if "/status/" not in url and "/search" not in url:
                # Still require at least a username path to avoid twitter home
                if url.rstrip("/") in ("https://twitter.com", "https://x.com"):
                    continue
            if url in seen_urls:
                continue
            seen_urls.add(url)

            title = r.get("title", "")
            body = r.get("body", "")
            combined = f"{title} {body}"

            # Extract twitter handle as poster name
            m = re.search(r"twitter\.com/([A-Za-z0-9_]+)/status", url)
            handle = m.group(1) if m else None

            jobs.append({
                "title": _extract_title_from_tweet(combined, role),
                "company": _extract_company_from_tweet(combined),
                "poster_name": handle,
                "poster_title": None,
                "poster_profile_url": f"https://twitter.com/{handle}" if handle else None,
                "poster_linkedin": None,
                "post_url": url,
                "platform": "twitter",
                "post_content": combined[:2000],
                "posted_at": _parse_date_hint(body),
                "location": _extract_location(combined),
                "job_type": _extract_job_type(combined),
                "is_remote": "remote" in combined.lower(),
                "tags": [role] + _extract_skills(combined),
                "matched_role": role,
                "salary_range": _extract_salary(combined),
            })

        time.sleep(0.8)

    return jobs


def _extract_title_from_tweet(text: str, fallback_role: str) -> str:
    patterns = [
        r"hiring\s+(?:a\s+)?(?:an?\s+)?([A-Za-z\s]+?)(?:at|for|to|!|\.|,)",
        r"looking for\s+(?:a\s+)?(?:an?\s+)?([A-Za-z\s]+?)(?:at|for|to|!|\.|,)",
        r"([A-Za-z\s]+?)\s+(?:position|role|opening)\s+(?:available|open)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            candidate = match.group(1).strip()
            if 1 <= len(candidate.split()) <= 6:
                return candidate.title()
    return fallback_role.title()


def _extract_company_from_tweet(text: str) -> Optional[str]:
    patterns = [
        r"at\s+([A-Z][A-Za-z0-9\s&.]+?)(?:\s+is|\s+we|\.|,|!)",
        r"@([A-Za-z0-9_]+)\s+is hiring",
        r"join\s+(?:us at\s+)?([A-Z][A-Za-z0-9\s&]+?)(?:\s+as|\s+to|\.|,|!)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            candidate = match.group(1).strip()
            if 1 <= len(candidate.split()) <= 5:
                return candidate
    return None


def _extract_location(text: str) -> Optional[str]:
    m = re.search(
        r"\b(Remote|New York|San Francisco|London|Berlin|Austin|Seattle|Boston|Toronto|NYC|SF)\b",
        text, re.IGNORECASE
    )
    return m.group(1) if m else None


def _extract_job_type(text: str) -> Optional[str]:
    tl = text.lower()
    if "contract" in tl or "freelance" in tl:
        return "contract"
    if "part-time" in tl or "part time" in tl:
        return "part-time"
    if "full-time" in tl or "full time" in tl:
        return "full-time"
    return None


def _extract_salary(text: str) -> Optional[str]:
    m = re.search(r"\$[\d,]+k?\s*(?:to|-)\s*\$[\d,]+k?|\$\d+[kKmM]", text, re.IGNORECASE)
    return m.group(0) if m else None


def _extract_skills(text: str) -> list:
    skill_keywords = [
        "Python", "React", "TypeScript", "JavaScript", "Go", "Rust", "Java",
        "Kubernetes", "AWS", "GCP", "SQL", "Machine Learning", "AI", "LLM",
    ]
    found = []
    for skill in skill_keywords:
        if re.search(r"\b" + re.escape(skill) + r"\b", text, re.IGNORECASE):
            found.append(skill)
    return found[:4]


def _parse_date_hint(text: str) -> Optional[str]:
    if not text:
        return None
    now = datetime.now(timezone.utc)
    m = re.search(r"(\d+)\s*(hour|day|week|month)", text, re.IGNORECASE)
    if m:
        n = int(m.group(1))
        unit = m.group(2).lower()
        if "hour" in unit:
            return (now - timedelta(hours=n)).isoformat()
        if "day" in unit:
            return (now - timedelta(days=n)).isoformat()
        if "week" in unit:
            return (now - timedelta(weeks=n)).isoformat()
        if "month" in unit:
            return (now - timedelta(days=n * 30)).isoformat()

    m2 = re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},\s+\d{4}", text)
    if m2:
        try:
            dt = datetime.strptime(m2.group(0), "%B %d, %Y")
            return dt.replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            try:
                dt = datetime.strptime(m2.group(0), "%b %d, %Y")
                return dt.replace(tzinfo=timezone.utc).isoformat()
            except ValueError:
                pass
    return None
