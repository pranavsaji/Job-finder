"""
LinkedIn personal hiring post scraper.
Uses DDG (DuckDuckGo search) to find personal LinkedIn posts from hiring managers
announcing open roles on their team.
"""

import asyncio
import re
import time
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import quote_plus


def _ddgs_search(query: str, max_results: int = 10, timelimit: Optional[str] = None) -> list:
    """Run a DuckDuckGo text search synchronously and return results."""
    import signal

    def _timeout_handler(signum, frame):
        raise TimeoutError("DDG search timed out")

    try:
        from ddgs import DDGS
        ddgs = DDGS()
        kwargs = {"max_results": max_results}
        if timelimit:
            kwargs["timelimit"] = timelimit

        # Hard 15-second timeout per query to prevent hanging
        old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(15)
        try:
            results = list(ddgs.text(query, **kwargs))
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)
        return results
    except TimeoutError:
        print(f"DDG search timed out for '{query[:60]}'")
        return []
    except Exception as e:
        print(f"DDG search error for '{query[:60]}': {e}")
        return []


def _preset_to_timelimit(date_preset: Optional[str]) -> Optional[str]:
    """Map date preset string to DDG timelimit: d=day, w=week, m=month."""
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
    """
    Find LinkedIn personal hiring posts using DuckDuckGo site: search.
    Returns posts from hiring managers announcing open roles on their team.
    """
    timelimit = _preset_to_timelimit(date_preset)
    # How many results to request per query — spread the limit across 6 query types
    per_query = max(5, (limit_per_platform // 2) + 2)
    all_posts = []

    for role in roles[:4]:
        posts = await asyncio.get_event_loop().run_in_executor(
            None, _search_hiring_posts_sync, role, country, timelimit, per_query
        )
        all_posts.extend(posts)
        await asyncio.sleep(1.5)

    # Deduplicate by URL
    seen = set()
    unique = []
    for post in all_posts:
        uid = post.get("post_url", "")
        if uid and uid not in seen:
            seen.add(uid)
            unique.append(post)

    return unique


def _search_hiring_posts_sync(
    role: str,
    country: Optional[str],
    timelimit: Optional[str] = None,
    per_query: int = 8,
) -> list:
    """
    Build multiple search queries targeting personal LinkedIn hiring posts
    (not LinkedIn job listings).
    """
    posts = []
    country_q = f' "{country}"' if country else ""

    # Varied queries to maximize coverage of personal hiring announcements
    queries = [
        f'site:linkedin.com/posts "my team is hiring" "{role}"{country_q}',
        f'site:linkedin.com/posts "we are hiring" "{role}"{country_q}',
        f'site:linkedin.com/posts "we\'re hiring" "{role}"{country_q}',
        f'site:linkedin.com/posts "looking for a" "{role}" ("dm me" OR "reach out" OR "apply"){country_q}',
        f'site:linkedin.com/posts "open role" "{role}"{country_q}',
        f'site:linkedin.com/posts "join my team" "{role}"{country_q}',
    ]

    seen_urls: set = set()

    for query in queries:
        results = _ddgs_search(query, max_results=per_query, timelimit=timelimit)
        for r in results:
            url = r.get("href", "")
            # Only accept linkedin.com/posts URLs, not job listings or profiles
            if not url or "linkedin.com/posts" not in url:
                continue
            if "/jobs/" in url or "linkedin.com/job" in url:
                continue
            if url in seen_urls:
                continue
            seen_urls.add(url)

            title = r.get("title", "")
            body = r.get("body", "")
            combined = f"{title} {body}"

            # Skip if this looks like a job board aggregator or company career page
            if any(skip in url.lower() for skip in ["jobs.", "careers.", "job-listing"]):
                continue

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

        # Avoid hitting DDG rate limits between queries
        time.sleep(0.8)

    return posts


def _parse_poster_from_title(title: str) -> tuple:
    """
    LinkedIn Google result titles typically look like:
    "John Smith on LinkedIn: 'My team is hiring...'"
    "Jane Doe, CTO at Acme | LinkedIn: ..."
    Extract name and title/company.
    """
    name = None
    poster_title = None

    # "Name on LinkedIn"
    m = re.match(r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+on\s+LinkedIn", title)
    if m:
        name = m.group(1).strip()

    # "Name, Title at Company | LinkedIn"
    m2 = re.match(r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})[,\s\-]+(.+?)(?:\s*\||\s*-\s*LinkedIn|$)", title)
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
        r"open\s+(?:role|position|headcount)\s+for\s+(?:a\s+)?([A-Za-z][A-Za-z\s\/\-]+?)(?:[!.,\n]|$)",
        r"join\s+(?:my\s+|our\s+)?team\s+as\s+(?:a\s+|an\s+)?([A-Za-z][A-Za-z\s\/\-]+?)(?:[!.,\n]|$)",
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
        r"\b([A-Z][a-z]+(?:,\s+[A-Z]{2})?)\b(?=\s+(?:area|based|office))",
        r"\b(New York|San Francisco|London|Berlin|Austin|Seattle|Boston|Toronto|Singapore|Dubai|Bangalore|NYC|SF|LA)\b",
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
    """Parse a date hint from DDG snippet (e.g. 'Aug 24, 2023' or '2 days ago')."""
    if not text:
        return None
    now = datetime.now(timezone.utc)

    # Try relative dates
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

    # Try absolute dates like "August 24, 2023"
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
