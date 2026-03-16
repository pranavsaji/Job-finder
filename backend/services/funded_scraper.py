"""
Recently funded companies intelligence scraper.
Companies that just raised money are ALWAYS hiring aggressively.
Uses DDG (DuckDuckGo) to find TechCrunch and other funding news.

Purpose: find companies with fresh capital and extract:
- Company name, funding amount, round
- Founder/CEO name and LinkedIn
- Sector, headquarters
- Whether they are actively hiring
"""

import asyncio
import re
import time
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import quote_plus


def _parse_tc_date(url: str) -> Optional[datetime]:
    """Extract publish date from TechCrunch URL: /YYYY/MM/DD/"""
    m = re.search(r"techcrunch\.com/(\d{4})/(\d{2})/(\d{2})/", url)
    if m:
        try:
            return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


def _ddgs_search(query: str, max_results: int = 10, timelimit: Optional[str] = None) -> list:
    try:
        from ddgs import DDGS
        kwargs = {"max_results": max_results}
        if timelimit:
            kwargs["timelimit"] = timelimit
        ddgs = DDGS(timeout=15)
        results = list(ddgs.text(query, **kwargs))
        return results
    except Exception as e:
        print(f"DDG search error for '{query[:60]}': {e}")
        return []


async def scrape_funded_companies(
    roles: list,
    country: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    limit_per_platform: int = 10,
    date_preset: Optional[str] = None,
) -> list:
    """
    Find recently funded companies via DDG search of TechCrunch and funding news.
    roles param is used as industry/sector hints if provided, otherwise broad search.
    """
    sector_hints = roles if roles else []

    per_query = max(5, (limit_per_platform // 2) + 2)
    timelimit_map = {"1h": "d", "24h": "d", "7d": "w", "30d": "m"}
    timelimit = timelimit_map.get(date_preset or "", "m")  # default: last month
    results = await asyncio.gather(
        asyncio.get_event_loop().run_in_executor(None, _search_techcrunch_sync, sector_hints, country, per_query, date_from, timelimit),
        asyncio.get_event_loop().run_in_executor(None, _search_funding_news_sync, sector_hints, country, per_query, date_from, timelimit),
        return_exceptions=True,
    )

    all_companies = []
    for r in results:
        if isinstance(r, list):
            all_companies.extend(r)

    # Deduplicate by normalized company name
    seen = set()
    unique = []
    for c in all_companies:
        key = (c.get("company") or "").lower().strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(c)

    return unique[:25]


def _search_techcrunch_sync(sectors: list, country: Optional[str], per_query: int = 8,
                             date_from: Optional[datetime] = None, timelimit: Optional[str] = None) -> list:
    """Search TechCrunch for recent funding news via DDG."""
    companies = []
    country_q = f' "{country}"' if country else ""

    if sectors:
        sector_term = " OR ".join(f'"{s}"' for s in sectors[:2])
        queries = [
            f'site:techcrunch.com "raises" "million" ({sector_term}) 2025 OR 2026{country_q}',
            f'site:techcrunch.com "series" funding ({sector_term}) 2025 OR 2026{country_q}',
        ]
    else:
        queries = [
            f'site:techcrunch.com "raises" "million" "series" startup 2026{country_q}',
            f'site:techcrunch.com "raises" "million" "series" startup 2025{country_q}',
            f'site:techcrunch.com "seed round" "raises" startup 2025 OR 2026{country_q}',
        ]

    for query in queries[:2]:
        results = _ddgs_search(query, max_results=per_query, timelimit=timelimit)
        for r in results:
            url = r.get("href", "")
            if "techcrunch.com" not in url:
                continue

            # Parse date from TC URL — skip if no date (sponsor/tag pages) or too old
            posted_at = _parse_tc_date(url)
            if not posted_at:
                continue  # Skip sponsor/tag/category pages without a date
            cutoff = date_from or (datetime.now(timezone.utc) - timedelta(days=90))
            if posted_at < cutoff:
                continue

            title = r.get("title", "")
            body = r.get("body", "")
            combined = f"{title} {body}"

            company_name = _extract_company_name(title, body)
            funding_amount = _extract_funding_amount(combined)
            funding_round = _extract_funding_round(combined)
            founder_name = _extract_founder_name(body)
            sector = _extract_sector(combined, sectors)

            content_parts = []
            if funding_amount and funding_round:
                content_parts.append(f"Raised {funding_amount} ({funding_round})")
            elif funding_amount:
                content_parts.append(f"Raised {funding_amount}")
            if sector:
                content_parts.append(f"Sector: {sector}")
            if founder_name:
                content_parts.append(f"Founder/CEO: {founder_name}")
            content_parts.append(f"Source: TechCrunch")
            content_parts.append(f"\n{body}")

            companies.append({
                "title": f"{company_name} - Recently Funded ({funding_round or 'Funding'})",
                "company": company_name,
                "poster_name": founder_name,
                "poster_title": "Founder / CEO",
                "poster_profile_url": url,
                "poster_linkedin": _build_founder_linkedin_url(founder_name, company_name),
                "post_url": url,
                "platform": "funded",
                "post_content": "\n".join(content_parts),
                "posted_at": posted_at,
                "location": country or _extract_headquarters(combined),
                "job_type": "full-time",
                "is_remote": False,
                "tags": _build_tags(funding_round, sector, sectors),
                "matched_role": sectors[0] if sectors else "General",
                "salary_range": funding_amount,
            })

        time.sleep(0.8)

    return companies


def _search_funding_news_sync(sectors: list, country: Optional[str], per_query: int = 8,
                               date_from: Optional[datetime] = None, timelimit: Optional[str] = None) -> list:
    """Search broader funding news via DDG."""
    companies = []
    country_q = f' "{country}"' if country else ""

    if sectors:
        sector_term = " OR ".join(f'"{s}"' for s in sectors[:2])
        queries = [
            f'("series a" OR "series b" OR "seed round") "raises" "million" ({sector_term}) 2025 OR 2026{country_q}',
            f'startup "just raised" "million" ({sector_term}) 2025 OR 2026{country_q}',
        ]
    else:
        queries = [
            f'("series a" OR "series b" OR "seed round") "raises" "million" startup 2026{country_q}',
            f'startup "just raised" "million" "series" 2026{country_q}',
            f'site:venturebeat.com "raises" "million" "series" 2025 OR 2026{country_q}',
        ]

    cutoff = date_from or (datetime.now(timezone.utc) - timedelta(days=90))

    for query in queries[:2]:
        results = _ddgs_search(query, max_results=per_query, timelimit=timelimit)
        for r in results:
            url = r.get("href", "")
            if not url or url.startswith("https://www.linkedin.com/jobs"):
                continue

            # For TC URLs, require a parseable date and skip old ones
            tc_date = _parse_tc_date(url)
            if "techcrunch.com" in url:
                if not tc_date or tc_date < cutoff:
                    continue

            title = r.get("title", "")
            body = r.get("body", "")
            combined = f"{title} {body}"

            # Must mention funding
            if not re.search(r"\$([\d]+(?:\.\d+)?)\s*(million|billion|M|B)", combined, re.IGNORECASE):
                continue

            company_name = _extract_company_name(title, body)
            funding_amount = _extract_funding_amount(combined)
            funding_round = _extract_funding_round(combined)
            founder_name = _extract_founder_name(body)
            sector = _extract_sector(combined, sectors)

            source_domain = re.search(r"https?://(?:www\.)?([^/]+)", url)
            source = source_domain.group(1) if source_domain else url[:40]

            content_parts = []
            if funding_amount:
                content_parts.append(f"Raised {funding_amount}" + (f" ({funding_round})" if funding_round else ""))
            if sector:
                content_parts.append(f"Sector: {sector}")
            if founder_name:
                content_parts.append(f"Founder/CEO: {founder_name}")
            content_parts.append(f"Source: {source}")
            content_parts.append(f"\n{body}")

            companies.append({
                "title": f"{company_name} - Recently Funded",
                "company": company_name,
                "poster_name": founder_name,
                "poster_title": "Founder / CEO",
                "poster_profile_url": url,
                "poster_linkedin": _build_founder_linkedin_url(founder_name, company_name),
                "post_url": url,
                "platform": "funded",
                "post_content": "\n".join(content_parts),
                "posted_at": tc_date,
                "location": country or _extract_headquarters(combined),
                "job_type": "full-time",
                "is_remote": False,
                "tags": _build_tags(funding_round, sector, sectors),
                "matched_role": sectors[0] if sectors else "General",
                "salary_range": funding_amount,
            })

        time.sleep(0.8)

    return companies


def _extract_company_name(title: str, snippet: str) -> str:
    combined = title + " " + snippet
    _NOISE = {"The", "A", "An", "Almost", "New", "Why", "How", "What", "When", "Latest",
              "Top", "Best", "Big", "After", "Before", "Report", "US", "EU", "UK", "VC"}
    patterns = [
        # "Rox.ai raises $5M" — may include dots/hyphens
        r"^([A-Z][A-Za-z0-9\.\-]+(?:\s+[A-Z][A-Za-z0-9\.\-]+)?)\s+(?:raises|raised|secures|closes|lands|bags)\s+\$",
        r"([A-Z][A-Za-z0-9\.\-]+(?:\s+[A-Z][A-Za-z0-9\.\-]+)?)\s+(?:Series\s+[A-Z]|Seed\s+round|Pre-[Ss]eed)",
        # "startup XYZ raises" — after "startup" keyword
        r"\bstartup\s+([A-Z][A-Za-z0-9\.\-]+(?:\s+[A-Z][A-Za-z0-9\.\-]+)?)\s+(?:raises|raised|lands|closes)",
    ]
    for pat in patterns:
        m = re.search(pat, combined)
        if m:
            name = m.group(1).strip()
            if 1 <= len(name.split()) <= 4 and name not in _NOISE:
                return name
    # Last resort: first 1-2 capitalized words from title
    m = re.match(r"^([A-Z][A-Za-z0-9\.\-]+(?:\s+[A-Z][A-Za-z0-9\.\-]+)?)", title)
    if m:
        name = m.group(1).strip()
        if name not in _NOISE:
            return name
    return "Funded Startup"


def _extract_funding_amount(text: str) -> Optional[str]:
    m = re.search(r"\$([\d]+(?:\.\d+)?)\s*(million|billion|M|B|K)\b", text, re.IGNORECASE)
    if m:
        return f"${m.group(1)}{m.group(2)[0].upper()}"
    return None


def _extract_funding_round(text: str) -> Optional[str]:
    m = re.search(
        r"\b(Pre-Seed|Seed|Series\s+[A-F]\+?|IPO|SPAC|Growth|Bridge)\b",
        text, re.IGNORECASE
    )
    return m.group(1).strip() if m else None


def _extract_founder_name(text: str) -> Optional[str]:
    patterns = [
        r"(?:CEO|founder|co-founder|founded by)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)",
        r"([A-Z][a-z]+\s+[A-Z][a-z]+),?\s+(?:CEO|founder|co-founder)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return None


def _extract_sector(text: str, hints: list) -> Optional[str]:
    for hint in hints:
        if hint.lower() in text.lower():
            return hint
    sectors = {
        "AI": ["artificial intelligence", " ai ", "machine learning", "llm", "generative"],
        "Fintech": ["fintech", "payments", "banking", "financial"],
        "HealthTech": ["healthtech", "health tech", "medical", "healthcare", "biotech"],
        "SaaS": ["saas", "software as a service", "b2b software"],
        "DevTools": ["developer tools", "devtools", "developer platform", "api platform"],
        "Climate": ["climate", "cleantech", "sustainability", "carbon"],
        "Cybersecurity": ["cybersecurity", "security", "infosec"],
        "EdTech": ["edtech", "education tech", "learning platform"],
        "Logistics": ["logistics", "supply chain", "shipping"],
        "Data": ["data platform", "analytics", "data infrastructure"],
    }
    text_lower = text.lower()
    for sector, keywords in sectors.items():
        if any(kw in text_lower for kw in keywords):
            return sector
    return None


def _extract_headquarters(text: str) -> Optional[str]:
    cities = [
        "San Francisco", "New York", "London", "Berlin", "Tel Aviv",
        "Singapore", "Toronto", "Austin", "Seattle", "Boston", "Paris",
        "Los Angeles", "Chicago", "Miami", "Dubai", "Bangalore",
    ]
    for city in cities:
        if city.lower() in text.lower():
            return city
    return None


def _build_founder_linkedin_url(founder_name: Optional[str], company_name: Optional[str]) -> Optional[str]:
    if founder_name:
        return f"https://www.linkedin.com/search/results/people/?keywords={quote_plus(founder_name + ' ' + (company_name or ''))}"
    if company_name:
        return f"https://www.linkedin.com/search/results/companies/?keywords={quote_plus(company_name)}"
    return None


def _build_tags(funding_round: Optional[str], sector: Optional[str], sectors: list) -> list:
    tags = ["funded"]
    if funding_round:
        tags.append(funding_round.lower())
    if sector:
        tags.append(sector.lower())
    for s in sectors[:2]:
        if s.lower() not in tags:
            tags.append(s.lower())
    return tags
