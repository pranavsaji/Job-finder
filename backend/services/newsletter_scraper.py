"""
Newsletter and blog hiring post scraper.
Searches Substack, Ghost, Beehiiv, and tech blogs for job mentions.
These are "dark market" postings that appear before public job boards.
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
        return list(ddgs.text(query, **kwargs))
    except Exception as e:
        print(f"DDG newsletter error: {e}")
        return []


def _preset_to_timelimit(date_preset: Optional[str]) -> Optional[str]:
    mapping = {"1h": "d", "24h": "d", "7d": "w", "30d": "m"}
    return mapping.get(date_preset or "", None)


def _parse_date_hint(text: str) -> Optional[str]:
    if not text:
        return None
    now = datetime.now(timezone.utc)
    m = re.search(r"(\d+)\s*(hour|day|week|month)", text, re.IGNORECASE)
    if m:
        n, unit = int(m.group(1)), m.group(2).lower()
        if "hour" in unit:
            return (now - timedelta(hours=n)).isoformat()
        if "day" in unit:
            return (now - timedelta(days=n)).isoformat()
        if "week" in unit:
            return (now - timedelta(weeks=n)).isoformat()
        if "month" in unit:
            return (now - timedelta(days=n * 30)).isoformat()
    return None


def _extract_company(text: str) -> Optional[str]:
    patterns = [
        r"(?:at|@|join)\s+([A-Z][A-Za-z0-9\s&.]+?)(?:\s*[!,.\n]|\s+is|\s+we|$)",
        r"([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)?)\s+is\s+(?:hiring|looking)",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            c = m.group(1).strip()
            if 1 <= len(c.split()) <= 4 and c not in ("We", "Our", "My", "The"):
                return c
    return None


async def scrape_newsletter_jobs(
    roles: list,
    country: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    limit_per_platform: int = 20,
    date_preset: Optional[str] = None,
) -> list:
    """Search newsletters and tech blogs for hiring posts."""
    per_query = max(12, limit_per_platform + 5)
    all_posts = []

    tasks = []
    for role in roles[:4]:
        tasks.append(asyncio.get_event_loop().run_in_executor(
            None, _search_newsletters_sync, role, country, per_query
        ))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    for r in results:
        if isinstance(r, list):
            all_posts.extend(r)

    # Deduplicate
    seen = set()
    unique = []
    for post in all_posts:
        uid = post.get("post_url", "")
        if uid and uid not in seen:
            seen.add(uid)
            unique.append(post)

    # Post-filter by date
    if date_from:
        filtered = []
        for post in unique:
            pd = post.get("posted_at")
            if pd is None:
                filtered.append(post)
                continue
            try:
                if isinstance(pd, str):
                    pd = datetime.fromisoformat(pd)
                if pd.tzinfo is None:
                    pd = pd.replace(tzinfo=timezone.utc)
                df = date_from if date_from.tzinfo else date_from.replace(tzinfo=timezone.utc)
                if pd >= df:
                    filtered.append(post)
            except Exception:
                filtered.append(post)
        unique = filtered

    return unique[:limit_per_platform]


def _search_newsletters_sync(role: str, country: Optional[str], per_query: int) -> list:
    posts = []
    country_q = f' "{country}"' if country else ""

    queries = [
        # Substack newsletters
        f'site:substack.com "we are hiring" "{role}"{country_q}',
        f'site:substack.com "hiring" "{role}" "apply"{country_q}',
        f'site:substack.com "join our team" "{role}"{country_q}',
        # Ghost blogs (common for tech companies)
        f'site:ghost.io "{role}" hiring{country_q}',
        # Beehiiv newsletters
        f'site:beehiiv.com "hiring" "{role}"{country_q}',
        # General tech blogs / company blogs
        f'"{role}" hiring site:medium.com{country_q}',
        f'"{role}" "we\'re hiring" site:dev.to{country_q}',
        f'indiehackers.com "hiring" "{role}"{country_q}',
        f'"{role}" "we are hiring" "email us" OR "apply here" blog 2025 OR 2026{country_q}',
        # Polywork (professional networking / project posts)
        f'site:polywork.com "hiring" "{role}"{country_q}',
    ]

    seen_urls: set = set()
    for query in queries:
        results = _ddgs_search(query, max_results=per_query)
        for r in results:
            url = r.get("href", "")
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)

            title = r.get("title", "")
            body = r.get("body", "")
            combined = f"{title} {body}"

            # Determine source
            source = "newsletter"
            if "substack.com" in url:
                source = "substack"
            elif "medium.com" in url:
                source = "medium"
            elif "dev.to" in url:
                source = "dev.to"
            elif "indiehackers.com" in url:
                source = "indiehackers"
            elif "ghost.io" in url:
                source = "ghost"

            posts.append({
                "title": _extract_job_title(combined, role),
                "company": _extract_company(combined),
                "poster_name": _extract_author(title),
                "poster_title": None,
                "poster_profile_url": None,
                "poster_linkedin": None,
                "post_url": url,
                "platform": "newsletter",
                "post_content": combined[:2000],
                "posted_at": _parse_date_hint(body),
                "location": _extract_location(combined),
                "job_type": _extract_job_type(combined),
                "is_remote": "remote" in combined.lower(),
                "tags": [role, source],
                "matched_role": role,
                "salary_range": _extract_salary(combined),
                "_source": source,
            })
        time.sleep(0.4)

    return posts


def _extract_job_title(text: str, fallback: str) -> str:
    patterns = [
        r"hiring\s+(?:a\s+|an\s+)?([A-Za-z][A-Za-z\s\/\-]+?)(?:\s+to\s|\s+for\s|\s+at\s|[!.,\n])",
        r"looking for\s+(?:a\s+|an\s+)?([A-Za-z][A-Za-z\s\/\-]+?)(?:\s+to\s|\s+for\s|[!.,\n])",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            c = m.group(1).strip()
            if 2 <= len(c.split()) <= 6:
                return c.title()
    return fallback.title()


def _extract_author(title: str) -> Optional[str]:
    m = re.match(r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+[-–|]", title)
    return m.group(1).strip() if m else None


def _extract_location(text: str) -> Optional[str]:
    m = re.search(
        r"\b(Remote|New York|San Francisco|London|Berlin|Austin|Seattle|Boston|Toronto|NYC|SF)\b",
        text, re.IGNORECASE,
    )
    return m.group(1) if m else None


def _extract_job_type(text: str) -> Optional[str]:
    tl = text.lower()
    if "contract" in tl:
        return "contract"
    if "part-time" in tl or "part time" in tl:
        return "part-time"
    if "internship" in tl or "intern" in tl:
        return "internship"
    return "full-time"


def _extract_salary(text: str) -> Optional[str]:
    m = re.search(r"\$[\d,]+k?\s*(?:[-–])\s*\$[\d,]+k?|\$\d+[kKmM]", text)
    return m.group(0) if m else None
