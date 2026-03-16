"""
Wellfound (AngelList) scraper.
Uses the public Wellfound job search page - no auth required for browsing.
Wellfound is ideal because it shows the founder/hiring manager directly.
"""

import httpx
import asyncio
import re
from datetime import datetime, timezone
from typing import Optional
from bs4 import BeautifulSoup


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


async def scrape_wellfound_jobs(
    roles: list,
    country: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> list:
    """Scrape Wellfound for startup jobs with founder info."""
    all_jobs = []

    for role in roles[:3]:
        jobs = await _search_wellfound(role, country)
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


async def _search_wellfound(role: str, country: Optional[str]) -> list:
    jobs = []
    slug = role.lower().replace(" ", "-")
    urls = [
        f"https://wellfound.com/role/r/{slug}",
        f"https://wellfound.com/jobs?q={role.replace(' ', '+')}",
    ]

    async with httpx.AsyncClient(timeout=15, headers=HEADERS, follow_redirects=True) as client:
        for url in urls[:1]:
            try:
                r = await client.get(url)
                if r.status_code != 200:
                    continue

                soup = BeautifulSoup(r.text, "html.parser")

                # Wellfound job cards
                cards = soup.find_all("div", attrs={"data-test": re.compile(r"job")})
                if not cards:
                    cards = soup.find_all("div", class_=re.compile(r"job|listing|startup"))

                for card in cards[:15]:
                    title = _extract_text(card, ["h2", "h3", ".title", "[class*='title']"])
                    company = _extract_text(card, ["[class*='company']", "[class*='startup']", "h4"])
                    location = _extract_text(card, ["[class*='location']", "[class*='geo']"])
                    link = card.find("a")
                    href = link["href"] if link and link.get("href") else url

                    if not href.startswith("http"):
                        href = f"https://wellfound.com{href}"

                    if not title and not company:
                        continue

                    jobs.append({
                        "title": title or role.title(),
                        "company": company or "Startup",
                        "poster_name": None,
                        "poster_title": "Founder / Hiring Manager",
                        "poster_profile_url": None,
                        "poster_linkedin": None,
                        "post_url": href,
                        "platform": "wellfound",
                        "post_content": f"{title or role} at {company or 'startup'}. {location or ''}",
                        "posted_at": None,
                        "location": location,
                        "job_type": "full-time",
                        "is_remote": "remote" in (location or "").lower(),
                        "tags": [role],
                        "matched_role": role,
                        "salary_range": None,
                    })
            except Exception as e:
                print(f"Wellfound scrape error for {role}: {e}")

    # Fallback: Google search for Wellfound listings
    if not jobs:
        jobs = await _google_wellfound(role, country)

    return jobs


async def _google_wellfound(role: str, country: Optional[str]) -> list:
    """Google site:wellfound.com search as fallback."""
    from urllib.parse import quote_plus
    jobs = []
    country_q = f' "{country}"' if country else ""
    query = f'site:wellfound.com/jobs "{role}"{country_q}'

    try:
        async with httpx.AsyncClient(timeout=12, headers=HEADERS, follow_redirects=True) as client:
            r = await client.get(
                f"https://www.google.com/search?q={quote_plus(query)}&num=15"
            )
            if r.status_code != 200:
                return jobs

            soup = BeautifulSoup(r.text, "html.parser")
            for result in soup.find_all("div", class_=re.compile(r"^g$|tF2Cxc"))[:10]:
                link = result.find("a")
                title_tag = result.find("h3")
                snippet_tag = result.find("div", class_=re.compile(r"VwiC3b|IsZvec"))

                href = link["href"] if link else ""
                if "wellfound.com" not in href:
                    continue
                if href.startswith("/url?q="):
                    href = href[7:].split("&")[0]

                title = title_tag.get_text(strip=True) if title_tag else role
                snippet = snippet_tag.get_text(separator=" ", strip=True) if snippet_tag else ""

                jobs.append({
                    "title": title,
                    "company": _extract_company(snippet),
                    "poster_name": None,
                    "poster_title": "Founder / Hiring Manager",
                    "poster_profile_url": None,
                    "poster_linkedin": None,
                    "post_url": href,
                    "platform": "wellfound",
                    "post_content": snippet,
                    "posted_at": None,
                    "location": None,
                    "job_type": "full-time",
                    "is_remote": "remote" in snippet.lower(),
                    "tags": [role],
                    "matched_role": role,
                    "salary_range": None,
                })
    except Exception as e:
        print(f"Google Wellfound fallback error: {e}")

    return jobs


def _extract_text(element, selectors: list) -> Optional[str]:
    for sel in selectors:
        try:
            found = element.select_one(sel)
            if found:
                return found.get_text(strip=True)
        except Exception:
            pass
    return None


def _extract_company(text: str) -> str:
    m = re.search(r"at\s+([A-Z][A-Za-z0-9\s&.]+?)(?:\s*[-|,.]|\s+is|\s+we)", text)
    if m:
        c = m.group(1).strip()
        if 1 <= len(c.split()) <= 5:
            return c
    return "Startup"
