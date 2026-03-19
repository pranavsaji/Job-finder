"""
LinkedIn hiring post scraper.
Multi-strategy approach: DDG with varied queries + Google News RSS fallback.
Designed to work from server IPs where site:linkedin.com is often rate-limited.
"""

import asyncio
import re
import time
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import quote_plus


def _ddgs_search(query: str, max_results: int = 10, timelimit: Optional[str] = None, _retry: int = 2) -> list:
    """Thread-safe DuckDuckGo search with retry on connection failure."""
    for attempt in range(_retry):
        try:
            from ddgs import DDGS
            kwargs = {"max_results": max_results}
            if timelimit:
                kwargs["timelimit"] = timelimit
            ddgs = DDGS(timeout=15)
            results = list(ddgs.text(query, **kwargs))
            if results:
                return results
        except Exception as e:
            print(f"DDG search error (attempt {attempt+1}) for '{query[:60]}': {e}")
            if attempt < _retry - 1:
                time.sleep(1.5)
    return []


def _preset_to_timelimit(date_preset: Optional[str]) -> Optional[str]:
    mapping = {"1h": "d", "24h": "d", "7d": "w", "30d": "m"}
    return mapping.get(date_preset or "", None)


async def scrape_linkedin_jobs(
    roles: list,
    country: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    limit_per_platform: int = 10,
    date_preset: Optional[str] = None,
) -> list:
    # Don't pass timelimit to DDG for LinkedIn — DDG barely indexes recent LinkedIn posts
    # so timelimit dramatically cuts results. We post-filter by date instead.
    # Keep per_query and roles capped to avoid >60s wall time (DDG takes 2-5s per call).
    per_query = min(12, max(8, limit_per_platform))
    all_posts = []

    tasks = []
    for role in roles[:3]:
        tasks.append(asyncio.get_event_loop().run_in_executor(
            None, _search_hiring_posts_sync, role, country, None, per_query
        ))
    # Also run Google News RSS search in parallel
    tasks.append(asyncio.get_event_loop().run_in_executor(
        None, _search_google_news_rss, roles[:3], country, date_from
    ))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    for r in results:
        if isinstance(r, list):
            all_posts.extend(r)

    # Deduplicate by URL
    seen = set()
    unique = []
    for post in all_posts:
        uid = post.get("post_url", "")
        if uid and uid not in seen:
            seen.add(uid)
            unique.append(post)

    # Post-filter by date if requested (more reliable than DDG timelimit)
    if date_from:
        filtered = []
        for post in unique:
            pd = post.get("posted_at")
            if pd is None:
                filtered.append(post)  # keep unknowns — better to over-include
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

    return unique[:limit_per_platform * 2]


def _search_hiring_posts_sync(
    role: str,
    country: Optional[str],
    timelimit: Optional[str] = None,
    per_query: int = 8,
) -> list:
    posts = []
    country_q = f' "{country}"' if country else ""
    year_q = " 2025 OR 2026"

    queries = [
        # Direct LinkedIn post searches
        f'site:linkedin.com/posts "hiring" "{role}"{country_q}',
        f'site:linkedin.com/posts "we are hiring" "{role}"{country_q}',
        f'site:linkedin.com/posts "my team is hiring" "{role}"{country_q}',
        # Broad hiring queries without site: (server IPs less likely to be blocked)
        f'"{role}" "we are hiring" linkedin{country_q}{year_q}',
        f'"{role}" "my team is hiring" linkedin{country_q}{year_q}',
        f'"{role}" "we\'re hiring" "join us" linkedin{country_q}',
        f'"{role}" hiring "open role" linkedin "dm me" OR "reach out"{country_q}',
        f'linkedin.com "{role}" "we are hiring"{country_q}{year_q}',
    ]

    seen_urls: set = set()
    for query in queries:
        results = _ddgs_search(query, max_results=per_query, timelimit=timelimit)
        for r in results:
            url = r.get("href", "")
            if not url or "linkedin.com" not in url:
                continue
            if any(skip in url for skip in ["/jobs/", "/job/", "/company/"]):
                continue
            if url in seen_urls:
                continue
            seen_urls.add(url)

            title = r.get("title", "")
            body = r.get("body", "")
            combined = f"{title} {body}"

            poster_name, poster_title = _parse_poster_from_title(title)
            posts.append({
                "title": _extract_role_from_post(combined, role),
                "company": _extract_company(combined),
                "poster_name": poster_name,
                "poster_title": poster_title,
                "poster_profile_url": None,
                "poster_linkedin": _build_poster_linkedin_search(poster_name),
                "post_url": url,
                "platform": "linkedin",
                "post_content": combined[:2000],
                "posted_at": _parse_date_hint(body),
                "location": _extract_location(combined),
                "job_type": _extract_job_type(combined),
                "is_remote": "remote" in combined.lower(),
                "tags": [role] + _extract_skills(combined),
                "matched_role": role,
                "salary_range": _extract_salary(combined),
            })
        time.sleep(0.2)

    return posts


def _search_google_news_rss(roles: list, country: Optional[str], date_from: Optional[datetime]) -> list:
    """Fetch hiring posts from Google News RSS — free, no API key, works from servers."""
    posts = []
    country_q = f" {country}" if country else " United States"

    for role in roles[:2]:
        try:
            q = quote_plus(f'"{role}" hiring linkedin{country_q}')
            url = f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"
            resp = httpx.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code != 200:
                continue

            # Parse RSS items
            items = re.findall(r"<item>(.*?)</item>", resp.text, re.DOTALL)
            for item in items[:15]:
                title_m = re.search(r"<title><!\[CDATA\[(.*?)\]\]></title>", item)
                link_m = re.search(r"<link>(.*?)</link>", item)
                desc_m = re.search(r"<description><!\[CDATA\[(.*?)\]\]></description>", item)
                date_m = re.search(r"<pubDate>(.*?)</pubDate>", item)

                if not title_m or not link_m:
                    continue

                item_title = title_m.group(1).strip()
                item_url = link_m.group(1).strip()
                item_desc = desc_m.group(1).strip() if desc_m else ""
                item_date_str = date_m.group(1).strip() if date_m else ""

                # Parse date
                posted_at = None
                if item_date_str:
                    try:
                        posted_at = datetime.strptime(item_date_str, "%a, %d %b %Y %H:%M:%S %Z")
                        posted_at = posted_at.replace(tzinfo=timezone.utc)
                    except ValueError:
                        pass

                if date_from and posted_at and posted_at < date_from:
                    continue

                # Clean HTML from description
                item_desc = re.sub(r"<[^>]+>", " ", item_desc)
                combined = f"{item_title} {item_desc}"

                posts.append({
                    "title": item_title[:120],
                    "company": _extract_company(combined),
                    "poster_name": None,
                    "poster_title": None,
                    "poster_profile_url": None,
                    "poster_linkedin": None,
                    "post_url": item_url,
                    "platform": "linkedin",
                    "post_content": combined[:2000],
                    "posted_at": posted_at,
                    "location": _extract_location(combined),
                    "job_type": _extract_job_type(combined),
                    "is_remote": "remote" in combined.lower(),
                    "tags": [role] + _extract_skills(combined),
                    "matched_role": role,
                    "salary_range": _extract_salary(combined),
                })
        except Exception as e:
            print(f"Google News RSS error: {e}")
        time.sleep(0.2)

    return posts


def _parse_poster_from_title(title: str) -> tuple:
    name = None
    poster_title = None
    m = re.match(r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+on\s+LinkedIn", title)
    if m:
        name = m.group(1).strip()
    m2 = re.match(r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})[,\s\-]+(.+?)(?:\s*\|\s*|\s*-\s*LinkedIn|$)", title)
    if m2 and not name:
        name = m2.group(1).strip()
        raw_title = re.sub(r"\s+on\s+LinkedIn.*$", "", m2.group(2).strip(), flags=re.IGNORECASE)
        if len(raw_title) < 100:
            poster_title = raw_title
    return name, poster_title


def _build_poster_linkedin_search(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    return f"https://www.linkedin.com/search/results/people/?keywords={quote_plus(name)}"


def _extract_role_from_post(text: str, fallback: str) -> str:
    patterns = [
        r"hiring\s+(?:a\s+|an\s+)?([A-Za-z][A-Za-z\s\/\-]+?)(?:\s+to\s|\s+for\s|\s+at\s|\s+who\s|[!.,\n])",
        r"looking for\s+(?:a\s+|an\s+)?([A-Za-z][A-Za-z\s\/\-]+?)(?:\s+to\s|\s+for\s|\s+at\s|[!.,\n])",
        r"open\s+(?:role|position)\s+for\s+(?:a\s+)?([A-Za-z][A-Za-z\s\/\-]+?)(?:[!.,\n]|$)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if 2 <= len(candidate.split()) <= 6:
                return candidate.title()
    return fallback.title()


def _extract_company(text: str) -> Optional[str]:
    patterns = [
        r"(?:at|@)\s+([A-Z][A-Za-z0-9\s&.,]+?)(?:\s+is|\s+we|\s+-|\.|,|!|\n|$)",
        r"join\s+([A-Z][A-Za-z0-9\s&.]+?)(?:\s+as|\s+to|\.|,|!|\n|$)",
        r"([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)?)\s+is\s+hiring",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            c = m.group(1).strip()
            if 1 <= len(c.split()) <= 5 and c not in ("LinkedIn", "My", "Our", "We"):
                return c
    return None


def _extract_location(text: str) -> Optional[str]:
    patterns = [
        r"\b(Remote(?:\s+[-\/]\s+[A-Za-z]+)?)\b",
        r"\b(New York|San Francisco|London|Berlin|Austin|Seattle|Boston|Toronto|Singapore|Dubai|Bangalore|NYC|SF|LA|Chicago|Miami|Denver)\b",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return None


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
    m = re.search(r"\$[\d,]+k?\s*(?:[-to]+)\s*\$[\d,]+k?|\$\d+[kKmM]", text, re.IGNORECASE)
    return m.group(0) if m else None


def _extract_skills(text: str) -> list:
    skill_keywords = [
        "Python", "React", "TypeScript", "JavaScript", "Go", "Rust", "Java",
        "Kubernetes", "AWS", "GCP", "SQL", "Machine Learning", "AI", "LLM",
        "Node.js", "FastAPI", "Django", "Rails", "Swift", "Kotlin", "C++",
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
