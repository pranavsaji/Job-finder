"""
Y Combinator job board scraper.
YC companies are well-funded, fast-growing, and the founders often post personally.
Uses the public YC job board API (workatastartup.com).
"""

import httpx
import asyncio
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote_plus
from bs4 import BeautifulSoup


HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html, */*",
}


async def scrape_yc_jobs(
    roles: list,
    country: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> list:
    """Scrape Y Combinator's Work at a Startup job board."""
    all_jobs = []

    tasks = [_search_yc(role, country) for role in roles[:3]]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, list):
            all_jobs.extend(result)

    seen = set()
    unique = []
    for job in all_jobs:
        uid = job.get("post_url", "")
        if uid and uid not in seen:
            seen.add(uid)
            unique.append(job)

    return unique


async def _search_yc(role: str, country: Optional[str]) -> list:
    jobs = []

    try:
        async with httpx.AsyncClient(timeout=15, headers=HEADERS, follow_redirects=True) as client:
            # Try the public API endpoint
            params = {"q": role}
            if country:
                params["country"] = country

            r = await client.get(
                "https://www.workatastartup.com/jobs",
                params=params,
            )

            if r.status_code == 200:
                soup = BeautifulSoup(r.text, "html.parser")
                job_cards = soup.find_all("div", class_=re.compile(r"job|listing"))

                for card in job_cards[:15]:
                    title_el = card.find(["h2", "h3", "a"], class_=re.compile(r"title|role|position"))
                    company_el = card.find(class_=re.compile(r"company|startup"))
                    loc_el = card.find(class_=re.compile(r"location|remote"))
                    link_el = card.find("a", href=True)

                    title = title_el.get_text(strip=True) if title_el else role.title()
                    company = company_el.get_text(strip=True) if company_el else "YC Startup"
                    location = loc_el.get_text(strip=True) if loc_el else None
                    href = link_el["href"] if link_el else ""
                    if href and not href.startswith("http"):
                        href = f"https://www.workatastartup.com{href}"

                    if not href:
                        continue

                    jobs.append({
                        "title": title,
                        "company": company,
                        "poster_name": None,
                        "poster_title": "YC Founder",
                        "poster_profile_url": None,
                        "poster_linkedin": None,
                        "post_url": href,
                        "platform": "yc",
                        "post_content": f"{title} at {company} (Y Combinator backed). {location or ''}",
                        "posted_at": None,
                        "location": location,
                        "job_type": "full-time",
                        "is_remote": "remote" in (location or "").lower(),
                        "tags": [role, "yc", "startup"],
                        "matched_role": role,
                        "salary_range": None,
                    })
    except Exception as e:
        print(f"YC scraper error for {role}: {e}")

    # Fallback: Google search
    if not jobs:
        jobs = await _google_yc(role, country)

    return jobs


async def _google_yc(role: str, country: Optional[str]) -> list:
    jobs = []
    country_q = f' "{country}"' if country else ""
    query = f'site:workatastartup.com "{role}"{country_q}'

    try:
        async with httpx.AsyncClient(timeout=12, headers=HEADERS, follow_redirects=True) as client:
            r = await client.get(f"https://www.google.com/search?q={quote_plus(query)}&num=15")
            if r.status_code != 200:
                return jobs

            soup = BeautifulSoup(r.text, "html.parser")
            for result in soup.find_all("div", class_=re.compile(r"^g$|tF2Cxc"))[:10]:
                link = result.find("a")
                title_tag = result.find("h3")
                snippet_tag = result.find("div", class_=re.compile(r"VwiC3b|IsZvec"))

                href = link["href"] if link else ""
                if "workatastartup.com" not in href:
                    continue
                if href.startswith("/url?q="):
                    href = href[7:].split("&")[0]

                title = title_tag.get_text(strip=True) if title_tag else role
                snippet = snippet_tag.get_text(separator=" ", strip=True) if snippet_tag else ""

                company = _extract_company(snippet)
                jobs.append({
                    "title": title,
                    "company": company,
                    "poster_name": None,
                    "poster_title": "YC Founder",
                    "poster_profile_url": None,
                    "poster_linkedin": None,
                    "post_url": href,
                    "platform": "yc",
                    "post_content": snippet,
                    "posted_at": None,
                    "location": None,
                    "job_type": "full-time",
                    "is_remote": "remote" in snippet.lower(),
                    "tags": [role, "yc", "startup"],
                    "matched_role": role,
                    "salary_range": None,
                })
    except Exception as e:
        print(f"Google YC fallback error: {e}")

    return jobs


def _extract_company(text: str) -> str:
    m = re.search(r"at\s+([A-Z][A-Za-z0-9\s&.]+?)(?:\s*[-|,.]|\s+is|\s+we)", text)
    if m:
        c = m.group(1).strip()
        if 1 <= len(c.split()) <= 5:
            return c
    return "YC Startup"
