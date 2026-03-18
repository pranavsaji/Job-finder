import httpx
import asyncio
from typing import Optional
from datetime import datetime
from bs4 import BeautifulSoup


async def enrich_person_from_linkedin(linkedin_url: str) -> dict:
    """Fetch and enrich person info from LinkedIn public profile."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    }

    person_data = {
        "name": None,
        "title": None,
        "company": None,
        "linkedin_url": linkedin_url,
        "bio": None,
        "location": None,
        "profile_image_url": None,
        "skills": [],
        "recent_posts": [],
        "enriched_at": datetime.utcnow().isoformat(),
    }

    try:
        google_url = f"https://www.google.com/search?q=site:linkedin.com+{linkedin_url.split('linkedin.com/')[-1]}"
        async with httpx.AsyncClient(timeout=15, headers=headers, follow_redirects=True) as client:
            response = await client.get(google_url)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, "html.parser")
                og_title = soup.find("meta", {"property": "og:title"})
                if og_title:
                    person_data["name"] = og_title.get("content", "").split("|")[0].strip()
                og_desc = soup.find("meta", {"property": "og:description"})
                if og_desc:
                    person_data["bio"] = og_desc.get("content", "")
    except Exception:
        pass

    if not person_data["name"] and linkedin_url:
        slug = linkedin_url.rstrip("/").split("/")[-1]
        name_from_slug = slug.replace("-", " ").title()
        if len(name_from_slug.split()) >= 2:
            person_data["name"] = name_from_slug

    return person_data


async def enrich_person(job: dict) -> dict:
    """Enrich person info from job posting data."""
    person_data = {
        "name": job.get("poster_name"),
        "title": job.get("poster_title"),
        "company": job.get("company"),
        "linkedin_url": job.get("poster_linkedin") or job.get("poster_profile_url"),
        "twitter_handle": None,
        "bio": None,
        "location": job.get("location"),
        "profile_image_url": None,
        "skills": [],
        "recent_posts": [],
        "enriched_at": datetime.utcnow().isoformat(),
        "job_id": job.get("id"),
    }

    linkedin_url = person_data.get("linkedin_url")
    if linkedin_url and "linkedin.com" in linkedin_url:
        enriched = await enrich_person_from_linkedin(linkedin_url)
        if enriched.get("name"):
            person_data["name"] = person_data["name"] or enriched["name"]
        if enriched.get("bio"):
            person_data["bio"] = enriched["bio"]
        if enriched.get("profile_image_url"):
            person_data["profile_image_url"] = enriched["profile_image_url"]

    if job.get("post_content"):
        person_data["recent_posts"] = [
            {
                "content": job["post_content"][:500],
                "platform": job.get("platform", "unknown"),
                "url": job.get("post_url"),
                "posted_at": job.get("posted_at"),
            }
        ]

    post_content = (job.get("post_content") or "").lower()
    skill_keywords = [
        "python", "javascript", "react", "node.js", "aws", "gcp", "azure",
        "machine learning", "ai", "data science", "product management",
        "sales", "marketing", "design", "devops", "kubernetes", "docker",
        "typescript", "go", "rust", "java", "c++", "sql",
    ]
    found_skills = [skill for skill in skill_keywords if skill in post_content]
    if found_skills:
        person_data["skills"] = found_skills[:8]

    return person_data
