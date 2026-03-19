import asyncio
from datetime import datetime, timezone
from typing import Optional

from backend.services.linkedin_scraper import scrape_linkedin_jobs
from backend.services.twitter_scraper import scrape_twitter_jobs
from backend.services.reddit_scraper import scrape_reddit_jobs
from backend.services.hn_scraper import scrape_hn_jobs
from backend.services.wellfound_scraper import scrape_wellfound_jobs
from backend.services.remoteok_scraper import scrape_remoteok_jobs
from backend.services.yc_scraper import scrape_yc_jobs
from backend.services.funded_scraper import scrape_funded_companies
from backend.services.jobboards_scraper import scrape_jobboard_jobs
from backend.services.newsletter_scraper import scrape_newsletter_jobs
from backend.services.claude_service import analyze_job_post


PLATFORM_MAP = {
    "linkedin": scrape_linkedin_jobs,
    "twitter": scrape_twitter_jobs,
    "reddit": scrape_reddit_jobs,
    "hn": scrape_hn_jobs,
    "wellfound": scrape_wellfound_jobs,
    "remoteok": scrape_remoteok_jobs,
    "yc": scrape_yc_jobs,
    "funded": scrape_funded_companies,
    "jobboards": scrape_jobboard_jobs,
    "newsletter": scrape_newsletter_jobs,
}


async def scrape_all(
    roles: list,
    platforms: Optional[list] = None,
    country: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    enrich_with_claude: bool = False,
    limit_per_platform: int = 10,
    date_preset: Optional[str] = None,
) -> list:
    """Orchestrate scraping across all requested platforms."""
    if not platforms:
        platforms = list(PLATFORM_MAP.keys())

    valid_platforms = [p for p in platforms if p in PLATFORM_MAP]

    if not valid_platforms:
        return []

    scrape_tasks = [
        _scrape_platform(platform, roles, country, date_from, date_to, limit_per_platform, date_preset)
        for platform in valid_platforms
    ]

    results = await asyncio.gather(*scrape_tasks, return_exceptions=True)

    # Separate post platforms (need LLM filtering) from listing platforms
    POST_PLATFORMS = {"linkedin", "twitter", "reddit"}
    post_jobs = []
    other_jobs = []

    for platform, result in zip(valid_platforms, results):
        if isinstance(result, Exception):
            print(f"Platform {platform} scrape failed: {result}")
            continue
        if isinstance(result, list):
            if platform in POST_PLATFORMS:
                post_jobs.extend(result)
            else:
                other_jobs.extend(result)

    # Run LLM filtering on personal posts to remove false positives
    if post_jobs:
        try:
            from backend.services.claude_service import filter_hiring_posts
            post_jobs = await filter_hiring_posts(post_jobs)
        except Exception as e:
            print(f"LLM post filtering error: {e}")

    all_jobs = post_jobs + other_jobs

    if enrich_with_claude:
        enriched = []
        for job in all_jobs[:20]:
            try:
                if job.get("post_content") and len(job["post_content"]) > 100:
                    analysis = await analyze_job_post(job["post_content"])
                    job = _merge_analysis(job, analysis)
                enriched.append(job)
            except Exception:
                enriched.append(job)
        all_jobs = enriched + all_jobs[20:]

    def _sort_key(j):
        dt = j.get("posted_at")
        if dt is None:
            return datetime.min.replace(tzinfo=timezone.utc)
        if isinstance(dt, str):
            try:
                return datetime.fromisoformat(dt)
            except Exception:
                return datetime.min.replace(tzinfo=timezone.utc)
        return dt

    all_jobs.sort(key=_sort_key, reverse=True)

    return all_jobs


_PLATFORM_TIMEOUT = 45  # seconds max per platform


async def _scrape_platform(
    platform: str,
    roles: list,
    country: Optional[str],
    date_from: Optional[datetime],
    date_to: Optional[datetime],
    limit_per_platform: int = 10,
    date_preset: Optional[str] = None,
) -> list:
    """Scrape a single platform with per-platform timeout and full error isolation."""
    scraper_fn = PLATFORM_MAP.get(platform)
    if not scraper_fn:
        return []

    async def _run():
        try:
            results = await scraper_fn(
                roles=roles,
                country=country,
                date_from=date_from,
                date_to=date_to,
                limit_per_platform=limit_per_platform,
                date_preset=date_preset,
            )
            return results[:limit_per_platform] if limit_per_platform > 0 else results
        except TypeError:
            try:
                results = await scraper_fn(roles=roles, country=country, date_from=date_from, date_to=date_to)
                return results[:limit_per_platform] if limit_per_platform > 0 else results
            except Exception as e:
                print(f"Error scraping {platform} (fallback): {e}")
                return []
        except Exception as e:
            print(f"Error scraping {platform}: {e}")
            return []

    try:
        return await asyncio.wait_for(_run(), timeout=_PLATFORM_TIMEOUT)
    except asyncio.TimeoutError:
        print(f"Platform {platform} timed out after {_PLATFORM_TIMEOUT}s")
        return []
    except Exception as e:
        print(f"Platform {platform} unexpected error: {e}")
        return []


def _merge_analysis(job: dict, analysis: dict) -> dict:
    """Merge Claude's analysis into job data without overwriting existing values."""
    if not analysis:
        return job

    fields_to_merge = [
        "title", "company", "location", "is_remote", "job_type",
        "salary_range", "poster_name", "poster_title",
    ]

    for field in fields_to_merge:
        if analysis.get(field) and not job.get(field):
            job[field] = analysis[field]

    if analysis.get("required_skills"):
        existing_tags = job.get("tags", [])
        new_tags = list(set(existing_tags + analysis["required_skills"][:5]))
        job["tags"] = new_tags

    return job
