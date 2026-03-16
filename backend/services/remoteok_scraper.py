"""
RemoteOK scraper - uses their public JSON API. 100% reliable, no blocking.
RemoteOK jobs include company info and tags. Great for remote roles.
"""

import httpx
import asyncio
from datetime import datetime, timezone
from typing import Optional


async def scrape_remoteok_jobs(
    roles: list,
    country: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    limit_per_platform: int = 30,
    date_preset: Optional[str] = None,
) -> list:
    """Fetch from RemoteOK public API and filter by role."""
    all_jobs = []

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://remoteok.com/api",
                headers={"User-Agent": "JobInfoFinder/1.0 (job research tool)"},
            )
            if r.status_code != 200:
                return []

            data = r.json()
            # First item is a legal notice dict, skip it
            listings = [d for d in data if isinstance(d, dict) and d.get("id")]

        role_keywords = [r.lower() for r in roles]

        for item in listings:
            title = item.get("position", "")
            tags = item.get("tags", [])
            company = item.get("company", "")
            description = item.get("description", "")
            slug = item.get("slug", "")
            post_url = f"https://remoteok.com/remote-jobs/{slug}" if slug else item.get("url", "")
            date_str = item.get("date", "")
            epoch = item.get("epoch", 0)

            # Filter by role
            combined = (title + " " + " ".join(tags) + " " + description).lower()
            if not any(kw in combined for kw in role_keywords):
                continue

            # Parse date
            posted_at = None
            if epoch:
                try:
                    posted_at = datetime.fromtimestamp(int(epoch), tz=timezone.utc)
                except Exception:
                    pass
            elif date_str:
                try:
                    posted_at = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                except Exception:
                    pass

            # Date filter
            if date_from and posted_at and posted_at < date_from.replace(tzinfo=timezone.utc):
                continue

            logo = item.get("logo", "")
            apply_url = item.get("apply_url", post_url)

            matched_role = next(
                (r for r in roles if r.lower() in combined), roles[0]
            )

            salary_min = item.get("salary_min")
            salary_max = item.get("salary_max")
            salary_range = None
            if salary_min and salary_max:
                salary_range = f"${salary_min:,} - ${salary_max:,}"

            all_jobs.append({
                "title": title,
                "company": company,
                "poster_name": None,
                "poster_title": "Hiring Team",
                "poster_profile_url": None,
                "poster_linkedin": None,
                "post_url": apply_url or post_url,
                "platform": "remoteok",
                "post_content": f"{title} at {company}. {description[:400] if description else ''}",
                "posted_at": posted_at,
                "location": "Remote",
                "job_type": "full-time",
                "is_remote": True,
                "tags": list(tags[:5]) + [matched_role],
                "matched_role": matched_role,
                "salary_range": salary_range,
            })

    except Exception as e:
        print(f"RemoteOK scrape error: {e}")

    return all_jobs[:limit_per_platform]
