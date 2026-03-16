import httpx
import asyncio
from datetime import datetime, timezone
from typing import Optional


REDDIT_BASE = "https://www.reddit.com"
TARGET_SUBREDDITS = [
    "forhire",
    "hiring",
    "remotework",
    "cscareerquestions",
    "devops",
    "MachineLearning",
    "datascience",
    "webdev",
    "Python",
    "javascript",
]

HEADERS = {
    "User-Agent": "JobInfoFinder/1.0 (job search aggregator)",
    "Accept": "application/json",
}


async def scrape_reddit_jobs(
    roles: list,
    country: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    subreddits: Optional[list] = None,
) -> list:
    """Scrape Reddit for job postings matching target roles."""
    all_jobs = []
    target_subs = subreddits or TARGET_SUBREDDITS[:5]

    for subreddit in target_subs:
        for role in roles[:3]:
            jobs = await _search_subreddit(subreddit, role, date_from, date_to)
            all_jobs.extend(jobs)
            await asyncio.sleep(1.0)

    seen_ids = set()
    unique = []
    for job in all_jobs:
        uid = job.get("post_url", "")
        if uid not in seen_ids:
            seen_ids.add(uid)
            unique.append(job)

    return unique


async def _search_subreddit(
    subreddit: str,
    role: str,
    date_from: Optional[datetime],
    date_to: Optional[datetime],
) -> list:
    """Search a specific subreddit for job posts."""
    jobs = []

    try:
        search_url = f"{REDDIT_BASE}/r/{subreddit}/search.json"
        params = {
            "q": f"{role} hiring",
            "restrict_sr": "1",
            "sort": "new",
            "limit": 25,
            "t": "month",
        }

        async with httpx.AsyncClient(timeout=15, headers=HEADERS, follow_redirects=True) as client:
            response = await client.get(search_url, params=params)

            if response.status_code == 429:
                await asyncio.sleep(5)
                return jobs

            if response.status_code != 200:
                return jobs

            data = response.json()
            posts = data.get("data", {}).get("children", [])

            for post in posts:
                post_data = post.get("data", {})
                if not post_data:
                    continue

                title = post_data.get("title", "")
                selftext = post_data.get("selftext", "")
                full_text = f"{title} {selftext}"

                is_hiring_post = any(kw in full_text.lower() for kw in [
                    "hiring", "looking for", "we're looking", "job opportunity",
                    "open position", "join our team", "[for hire]", "[hiring]",
                ])

                if not is_hiring_post:
                    continue

                created_utc = post_data.get("created_utc", 0)
                posted_at = datetime.fromtimestamp(created_utc, tz=timezone.utc) if created_utc else None

                if date_from and posted_at and posted_at < date_from:
                    continue
                if date_to and posted_at and posted_at > date_to:
                    continue

                author = post_data.get("author", "reddit_user")
                post_id = post_data.get("id", "")
                permalink = post_data.get("permalink", "")

                flair = post_data.get("link_flair_text", "")
                is_remote = any(kw in full_text.lower() for kw in ["remote", "work from home", "wfh", "distributed"])

                jobs.append({
                    "title": _extract_job_title(title, role),
                    "company": _extract_company(title, selftext),
                    "poster_name": author,
                    "poster_title": None,
                    "poster_profile_url": f"https://www.reddit.com/user/{author}",
                    "poster_linkedin": None,
                    "post_url": f"https://www.reddit.com{permalink}",
                    "platform": "reddit",
                    "post_content": f"{title}\n\n{selftext}"[:2000],
                    "posted_at": posted_at,
                    "location": flair or None,
                    "job_type": _extract_job_type(full_text),
                    "is_remote": is_remote,
                    "tags": [role, subreddit],
                    "matched_role": role,
                    "salary_range": _extract_salary(full_text),
                })

    except Exception as e:
        print(f"Reddit scrape error for r/{subreddit} + '{role}': {e}")

    return jobs


async def scrape_forhire_subreddit(roles: list, date_from: Optional[datetime] = None) -> list:
    """Specifically scrape r/forhire for recent hiring posts."""
    jobs = []

    try:
        async with httpx.AsyncClient(timeout=15, headers=HEADERS, follow_redirects=True) as client:
            response = await client.get(
                f"{REDDIT_BASE}/r/forhire/new.json",
                params={"limit": 50},
            )

            if response.status_code == 200:
                data = response.json()
                posts = data.get("data", {}).get("children", [])

                for post in posts:
                    post_data = post.get("data", {})
                    title = post_data.get("title", "").lower()
                    selftext = post_data.get("selftext", "").lower()
                    full_text = f"{title} {selftext}"

                    if "[hiring]" not in post_data.get("title", "").lower():
                        continue

                    for role in roles:
                        if role.lower() in full_text or _role_matches_text(role, full_text):
                            created_utc = post_data.get("created_utc", 0)
                            posted_at = datetime.fromtimestamp(created_utc, tz=timezone.utc) if created_utc else None

                            if date_from and posted_at and posted_at < date_from:
                                continue

                            author = post_data.get("author", "reddit_user")
                            permalink = post_data.get("permalink", "")

                            jobs.append({
                                "title": post_data.get("title", "")[:200],
                                "company": _extract_company(post_data.get("title", ""), post_data.get("selftext", "")),
                                "poster_name": author,
                                "poster_title": None,
                                "poster_profile_url": f"https://www.reddit.com/user/{author}",
                                "poster_linkedin": None,
                                "post_url": f"https://www.reddit.com{permalink}",
                                "platform": "reddit",
                                "post_content": f"{post_data.get('title', '')}\n\n{post_data.get('selftext', '')}"[:2000],
                                "posted_at": posted_at,
                                "location": None,
                                "job_type": _extract_job_type(full_text),
                                "is_remote": "remote" in full_text,
                                "tags": [role, "forhire"],
                                "matched_role": role,
                                "salary_range": _extract_salary(full_text),
                            })
                            break

    except Exception as e:
        print(f"r/forhire scrape error: {e}")

    return jobs


def _role_matches_text(role: str, text: str) -> bool:
    role_words = role.lower().split()
    return sum(1 for word in role_words if word in text) >= max(1, len(role_words) - 1)


def _extract_job_title(title: str, fallback_role: str) -> str:
    """Extract a clean job title from Reddit post title."""
    import re
    title = re.sub(r"\[.*?\]", "", title).strip()
    if len(title) > 10:
        return title[:200]
    return fallback_role


def _extract_company(title: str, body: str) -> str:
    """Try to extract company name from post."""
    import re
    patterns = [
        r"at\s+([A-Z][A-Za-z0-9\s&]+?)(?:\s+-|\s+is|\s+\(|\.)",
        r"company:\s*([^\n]+)",
        r"([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)?)\s+is hiring",
    ]
    combined = f"{title} {body[:500]}"
    for pattern in patterns:
        match = re.search(pattern, combined)
        if match:
            candidate = match.group(1).strip()
            if 1 < len(candidate.split()) <= 5 and len(candidate) < 60:
                return candidate
    return "Unknown Company"


def _extract_job_type(text: str) -> Optional[str]:
    text_lower = text.lower()
    if "contract" in text_lower or "freelance" in text_lower:
        return "contract"
    if "part-time" in text_lower or "part time" in text_lower:
        return "part-time"
    if "full-time" in text_lower or "full time" in text_lower:
        return "full-time"
    if "internship" in text_lower or "intern" in text_lower:
        return "internship"
    return None


def _extract_salary(text: str) -> Optional[str]:
    import re
    patterns = [
        r"\$[\d,]+k?\s*(?:to|-)\s*\$[\d,]+k?",
        r"\$[\d,]+\s*(?:per year|/year|annually|/yr|pa)",
        r"[\d,]+k?\s*(?:to|-)\s*[\d,]+k?\s*(?:usd|per year)",
        r"salary:\s*[\$\d,k]+.*?(?:\n|\.)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(0).strip()[:100]
    return None
