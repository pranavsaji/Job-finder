import httpx
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional


HN_ALGOLIA_BASE = "https://hn.algolia.com/api/v1"


async def scrape_hn_jobs(
    roles: list,
    country: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    limit_per_platform: int = 50,
    date_preset: Optional[str] = None,
) -> list:
    """Scrape Hacker News for job postings using Algolia HN Search API."""
    all_jobs = []

    who_is_hiring = await _scrape_who_is_hiring(roles, date_from)
    all_jobs.extend(who_is_hiring)

    for role in roles[:3]:
        role_jobs = await _search_hn_jobs(role, date_from, date_to)
        all_jobs.extend(role_jobs)
        await asyncio.sleep(0.5)

    seen_ids = set()
    unique_jobs = []
    for job in all_jobs:
        job_id = job.get("post_url", "")
        if job_id not in seen_ids:
            seen_ids.add(job_id)
            unique_jobs.append(job)

    return unique_jobs


async def _scrape_who_is_hiring(roles: list, date_from: Optional[datetime] = None) -> list:
    """Find current 'Who is Hiring' thread and search for roles."""
    jobs = []

    # Only look at threads from the last 90 days so we never pull 2020/2021 threads
    cutoff_90d = int((datetime.now(timezone.utc) - timedelta(days=90)).timestamp())
    # Effective comment cutoff: the caller's date_from or 90 days ago, whichever is more recent
    comment_cutoff = max(
        int(date_from.timestamp()) if date_from else cutoff_90d,
        cutoff_90d,
    )

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{HN_ALGOLIA_BASE}/search",
                params={
                    "query": "Ask HN: Who is hiring",
                    "tags": "story,ask_hn",
                    "hitsPerPage": 5,
                    "numericFilters": f"created_at_i>{cutoff_90d}",
                },
            )

            if response.status_code != 200:
                return jobs

            data = response.json()
            # Sort by most recent first
            hits = sorted(data.get("hits", []), key=lambda h: h.get("created_at_i", 0), reverse=True)

            for hit in hits[:2]:
                story_id = hit.get("objectID")
                if not story_id:
                    continue

                comments_resp = await client.get(
                    f"{HN_ALGOLIA_BASE}/search",
                    params={
                        "tags": f"comment,story_{story_id}",
                        "hitsPerPage": 100,
                        "numericFilters": f"created_at_i>{comment_cutoff}",
                    },
                )

                if comments_resp.status_code != 200:
                    continue

                comments_data = comments_resp.json()
                for comment in comments_data.get("hits", []):
                    comment_text = comment.get("comment_text", "")
                    if not comment_text:
                        continue

                    text_lower = comment_text.lower()
                    for role in roles:
                        if role.lower() in text_lower or _role_matches(role, text_lower):
                            posted_at = None
                            ts = comment.get("created_at_i")
                            if ts:
                                posted_at = datetime.fromtimestamp(ts, tz=timezone.utc)

                            if date_from and posted_at and posted_at < date_from:
                                continue

                            author = comment.get("author", "HN User")
                            jobs.append({
                                "title": _extract_title_from_hn(comment_text),
                                "company": _extract_company_from_hn(comment_text),
                                "poster_name": author,
                                "poster_title": None,
                                "poster_profile_url": f"https://news.ycombinator.com/user?id={author}",
                                "poster_linkedin": None,
                                "post_url": f"https://news.ycombinator.com/item?id={comment.get('objectID')}",
                                "platform": "hn",
                                "post_content": _clean_hn_html(comment_text),
                                "posted_at": posted_at,
                                "location": None,
                                "job_type": None,
                                "is_remote": "remote" in text_lower,
                                "tags": [role],
                                "matched_role": role,
                            })
                            break

    except Exception as e:
        print(f"HN who-is-hiring scrape error: {e}")

    return jobs


async def _search_hn_jobs(
    role: str,
    date_from: Optional[datetime],
    date_to: Optional[datetime],
) -> list:
    """Search HN Algolia for job-related posts."""
    jobs = []

    try:
        params = {
            "query": f"{role} hiring",
            "tags": "job",
            "hitsPerPage": 20,
        }

        if date_from:
            params["numericFilters"] = f"created_at_i>{int(date_from.timestamp())}"

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(f"{HN_ALGOLIA_BASE}/search", params=params)

            if response.status_code != 200:
                return jobs

            data = response.json()
            for hit in data.get("hits", []):
                title = hit.get("title", "")
                text = hit.get("text", "") or hit.get("story_text", "") or title

                posted_at = None
                ts = hit.get("created_at_i")
                if ts:
                    posted_at = datetime.fromtimestamp(ts, tz=timezone.utc)

                if date_to and posted_at and posted_at > date_to:
                    continue

                author = hit.get("author", "HN User")
                jobs.append({
                    "title": title or _extract_title_from_hn(text),
                    "company": hit.get("company") or _extract_company_from_hn(text),
                    "poster_name": author,
                    "poster_title": None,
                    "poster_profile_url": f"https://news.ycombinator.com/user?id={author}",
                    "poster_linkedin": None,
                    "post_url": f"https://news.ycombinator.com/item?id={hit.get('objectID')}",
                    "platform": "hn",
                    "post_content": _clean_hn_html(text),
                    "posted_at": posted_at,
                    "location": None,
                    "job_type": None,
                    "is_remote": "remote" in text.lower(),
                    "tags": [role],
                    "matched_role": role,
                })

    except Exception as e:
        print(f"HN job search error for '{role}': {e}")

    return jobs


def _role_matches(role: str, text: str) -> bool:
    """Check if text loosely matches a role."""
    role_words = role.lower().split()
    return sum(1 for word in role_words if word in text) >= len(role_words) // 2 + 1


def _clean_hn_html(text: str) -> str:
    """Strip HTML tags and decode entities from HN comment text, preserving newlines."""
    import re
    text = re.sub(r"<[^>]+>", " ", text)
    text = (text
            .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
            .replace("&#x27;", "'").replace("&#x2F;", "/").replace("&#x60;", "`")
            .replace("&quot;", '"').replace("&nbsp;", " "))
    # Collapse multiple spaces within each line but keep newlines
    lines = [" ".join(line.split()) for line in text.split("\n")]
    return "\n".join(lines)


def _extract_title_from_hn(text: str) -> str:
    """Extract job title from HN comment. Standard format: Company | Role | Location | ..."""
    # Process line-by-line so we don't lose the pipe structure
    for line in text.split("\n")[:4]:
        clean = _clean_hn_html(line).strip()
        if not clean or "|" not in clean:
            continue
        parts = [p.strip() for p in clean.split("|") if p.strip() and "http" not in p.lower()]
        if len(parts) >= 2:
            return parts[1][:120]  # Role is 2nd segment after company
        if len(parts) == 1:
            return parts[0][:120]
    # Fallback: first cleaned line
    first = _clean_hn_html(text.split("\n")[0]).strip() if text else ""
    return first[:100] if first else "HN Job Posting"


def _extract_company_from_hn(text: str) -> Optional[str]:
    """Extract company name from HN comment (first pipe-separated segment)."""
    for line in text.split("\n")[:4]:
        clean = _clean_hn_html(line).strip()
        if not clean or "|" not in clean:
            continue
        parts = [p.strip() for p in clean.split("|") if p.strip()]
        first = parts[0] if parts else ""
        if first and 0 < len(first.split()) <= 6 and "http" not in first.lower():
            return first
    return None
