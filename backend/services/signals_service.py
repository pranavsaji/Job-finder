"""
Company intelligence signals: funding rounds, GitHub activity,
exec hires, product launches. All free/public sources.
"""
import asyncio
import re
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional


_NON_ENGLISH_RE = re.compile(
    r"[\u4e00-\u9fff"   # Chinese
    r"\u3040-\u309f"   # Hiragana
    r"\u30a0-\u30ff"   # Katakana
    r"\uac00-\ud7af"   # Korean
    r"\u0600-\u06ff"   # Arabic
    r"\u0400-\u04ff"   # Cyrillic
    r"\u0900-\u097f]", # Devanagari
)

_JUNK_DOMAINS = re.compile(
    r"(pinterest\.|flickr\.|instagram\.|aliexpress\.|taobao\.|baidu\.|"
    r"zhihu\.|weibo\.|qq\.com|163\.com|tianya\.|csdn\.net|"
    r"gettyimages\.|shutterstock\.|istockphoto\.|alamy\.)",
    re.IGNORECASE,
)


def _is_english_result(r: dict) -> bool:
    """Return False for non-English titles, garbage image sites, etc."""
    title = r.get("title", "")
    url = r.get("href", "")
    body = r.get("body", "")
    if _NON_ENGLISH_RE.search(title) or _NON_ENGLISH_RE.search(body[:100]):
        return False
    if _JUNK_DOMAINS.search(url):
        return False
    return True


def _ddgs_search(query: str, max_results: int = 5, _retry: int = 2) -> list:
    for attempt in range(_retry):
        try:
            from ddgs import DDGS
            # region="us-en" biases toward English results
            ddgs = DDGS(timeout=15)
            results = list(ddgs.text(query, max_results=max_results + 4, region="us-en"))
            filtered = [r for r in results if _is_english_result(r)]
            if filtered:
                return filtered[:max_results]
            if results:
                return results[:max_results]  # fallback: return unfiltered if all filtered out
        except Exception as e:
            print(f"DDG search error (attempt {attempt+1}) for '{query[:60]}': {e}")
            if attempt < _retry - 1:
                import time
                time.sleep(1.5)
    return []


def _parse_date_hint(text: str) -> Optional[datetime]:
    if not text:
        return None
    now = datetime.now(timezone.utc)
    m = re.search(r"(\d+)\s*(hour|day|week|month)", text, re.IGNORECASE)
    if m:
        n, unit = int(m.group(1)), m.group(2).lower()
        if "hour" in unit:
            return now - timedelta(hours=n)
        if "day" in unit:
            return now - timedelta(days=n)
        if "week" in unit:
            return now - timedelta(weeks=n)
        if "month" in unit:
            return now - timedelta(days=n * 30)
    return None


async def fetch_company_signals(company: str, roles: Optional[list] = None) -> list:
    tasks = [
        _github_signals(company),
        _funding_signals(company),
        _exec_hire_signals(company),
        _product_signals(company),
        _headcount_signals(company),
    ]
    if roles:
        tasks.append(_job_opening_signals(company, roles))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    signals = []
    for r in results:
        if isinstance(r, list):
            signals.extend(r)

    signals.sort(
        key=lambda s: s.get("date") or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return signals


async def scan_signals_for_roles(roles: list, companies: Optional[list] = None) -> list:
    """
    Broad scan: find companies showing hiring signals for given roles.
    Strategy: run multiple targeted DDG searches and extract company names
    from job post titles / news headlines.
    """
    loop = asyncio.get_event_loop()
    all_signals = []

    signal_queries = []
    for role in roles[:3]:
        signal_queries += [
            # Greenhouse ATS — URL contains company slug
            (f'site:boards.greenhouse.io "{role}"', "job_opening", role),
            # Lever ATS — URL contains company slug
            (f'site:jobs.lever.co "{role}"', "job_opening", role),
            # Wellfound company jobs — URL has /company/SLUG
            (f'site:wellfound.com/company "{role}"', "job_opening", role),
            # Ashby ATS
            (f'site:jobs.ashbyhq.com "{role}"', "job_opening", role),
            # LinkedIn jobs (title extraction) — explicit English/US scope
            (f'site:linkedin.com/jobs "{role}" hiring (2025 OR 2026) -lang:zh -lang:ja', "job_opening", role),
            # HN Who's Hiring — company names in posts
            (f'site:news.ycombinator.com "who is hiring" "{role}" 2025 OR 2026', "hiring_signal", role),
        ]

    tasks = [
        loop.run_in_executor(None, _ddgs_search, q, 6)
        for q, _, _ in signal_queries
    ]
    results_all = await asyncio.gather(*tasks, return_exceptions=True)

    for (query, sig_type, role), results in zip(signal_queries, results_all):
        if not isinstance(results, list):
            continue
        for r in results:
            company = _extract_company_from_result(r.get("title", ""), r.get("href", ""), r.get("body", ""))
            all_signals.append({
                "type": sig_type,
                "company": company or "Unknown",
                "title": r.get("title", "")[:120],
                "description": r.get("body", "")[:300],
                "url": r.get("href", ""),
                "date": _parse_date_hint(r.get("body", "")),
                "badge": _type_to_badge(sig_type),
                "badge_color": _type_to_color(sig_type),
                "matched_role": role,
            })

    seen = set()
    unique = []
    for s in all_signals:
        k = s.get("url", "")
        if k and k not in seen:
            seen.add(k)
            unique.append(s)
    return unique


def _type_to_badge(t: str) -> str:
    return {"funding": "Funding Signal", "news": "News", "job_opening": "Open Role",
            "github": "GitHub", "hiring_signal": "Hiring Signal"}.get(t, "Signal")


def _type_to_color(t: str) -> str:
    return {"funding": "green", "news": "blue", "job_opening": "red",
            "github": "blue", "hiring_signal": "green"}.get(t, "purple")


def _extract_company_from_result(title: str, url: str, body: str) -> Optional[str]:
    """Extract company name from search result title, URL, or body."""
    # Try URL-based extraction (wellfound, linkedin company pages)
    import re as _re
    url_patterns = [
        r"boards\.greenhouse\.io/([a-z0-9\-_]+)/jobs",
        r"boards\.greenhouse\.io/([a-z0-9\-_]+)$",
        r"boards\.greenhouse\.io/([a-z0-9\-_]+)[/?]",
        r"jobs\.lever\.co/([a-z0-9\-_]+)/",
        r"jobs\.lever\.co/([a-z0-9\-_]+)$",
        r"jobs\.ashbyhq\.com/([a-z0-9\-_]+)/",
        r"jobs\.ashbyhq\.com/([a-z0-9\-_]+)$",
        r"wellfound\.com/company/([a-z0-9\-]+)",
        r"linkedin\.com/company/([a-z0-9\-]+)",
        r"greenhouse\.io/([a-z0-9\-]+)/jobs",
        r"lever\.co/([a-z0-9\-]+)/",
    ]
    for pat in url_patterns:
        m = _re.search(pat, url)
        if m:
            slug = m.group(1).replace("-", " ").replace("_", " ").title()
            if slug and slug.lower() not in ("embed", "jobs", "apply"):
                # Try to extract a cleaner name from title "Job Application for X at COMPANY"
                at_m = _re.search(r"\bat\s+([A-Z][A-Za-z0-9&\.\s\-]+?)(?:\s*[\|\-]|\s*$)", title)
                if at_m:
                    candidate = at_m.group(1).strip()
                    if 1 <= len(candidate.split()) <= 5:
                        return candidate
                return slug

    # Try title patterns
    title_patterns = [
        r"^([A-Z][A-Za-z0-9&\.\-]+(?:\s+[A-Z][A-Za-z0-9&\.]+)?)\s+(?:is\s+)?[Hh]iring",
        r"^([A-Z][A-Za-z0-9&\.\-]+(?:\s+[A-Z][A-Za-z0-9&\.]+)?)\s+(?:raises|secures|launches)",
        r"Jobs?\s+at\s+([A-Z][A-Za-z0-9&\.\-]+(?:\s+[A-Z][A-Za-z0-9&\.]+)?)",
        r"([A-Z][A-Za-z0-9&\.\-]+(?:\s+[A-Z][A-Za-z0-9&\.]+)?)\s+Jobs?\s*[|\-]",
    ]
    for pat in title_patterns:
        m = _re.search(pat, title)
        if m:
            c = m.group(1).strip()
            if 1 <= len(c.split()) <= 4 and c not in ("The", "A", "An", "Top", "Best"):
                return c
    return None


async def _github_signals(company: str) -> list:
    signals = []
    try:
        slug = re.sub(r"[^a-z0-9-]", "-", company.lower()).strip("-")
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "JobFinder/1.0"}) as client:
            resp = await client.get(
                f"https://api.github.com/orgs/{slug}/repos",
                params={"sort": "updated", "per_page": 10},
            )
            if resp.status_code == 200:
                cutoff = datetime.now(timezone.utc) - timedelta(days=60)
                for repo in resp.json()[:6]:
                    updated_str = repo.get("updated_at", "")
                    if not updated_str:
                        continue
                    try:
                        dt = datetime.fromisoformat(updated_str.replace("Z", "+00:00"))
                    except Exception:
                        continue
                    if dt < cutoff:
                        continue
                    lang = repo.get("language") or "Unknown"
                    desc = repo.get("description") or ""
                    signals.append({
                        "type": "github",
                        "company": company,
                        "title": f"Active repo: {repo['name']} ({lang})",
                        "description": desc[:200] or f"Recently updated {lang} repository",
                        "url": repo.get("html_url", ""),
                        "date": dt,
                        "badge": "GitHub Activity",
                        "badge_color": "blue",
                        "stars": repo.get("stargazers_count", 0),
                    })
    except Exception as e:
        print(f"GitHub signal error for {company}: {e}")
    return signals[:4]


async def _funding_signals(company: str) -> list:
    signals = []
    try:
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(None, _ddgs_search,
            f'"{company}" funding raised million 2025 OR 2026', 5)
        for r in results:
            signals.append({
                "type": "funding",
                "company": company,
                "title": r.get("title", "")[:120],
                "description": r.get("body", "")[:300],
                "url": r.get("href", ""),
                "date": _parse_date_hint(r.get("body", "")),
                "badge": "Funding Round",
                "badge_color": "green",
            })
    except Exception as e:
        print(f"Funding signal error for {company}: {e}")
    return signals[:3]


async def _exec_hire_signals(company: str) -> list:
    signals = []
    try:
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(None, _ddgs_search,
            f'"{company}" "joins as" OR "appointed" OR "hires new" "VP" OR "CTO" OR "Director" OR "Head of" 2025 OR 2026', 5)
        for r in results:
            signals.append({
                "type": "exec_hire",
                "company": company,
                "title": r.get("title", "")[:120],
                "description": r.get("body", "")[:300],
                "url": r.get("href", ""),
                "date": _parse_date_hint(r.get("body", "")),
                "badge": "Exec Hire",
                "badge_color": "purple",
            })
    except Exception as e:
        print(f"Exec hire signal error for {company}: {e}")
    return signals[:3]


async def _product_signals(company: str) -> list:
    signals = []
    try:
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(None, _ddgs_search,
            f'"{company}" "launches" OR "releases" OR "introduces" new product feature 2025 OR 2026', 5)
        for r in results:
            signals.append({
                "type": "product",
                "company": company,
                "title": r.get("title", "")[:120],
                "description": r.get("body", "")[:300],
                "url": r.get("href", ""),
                "date": _parse_date_hint(r.get("body", "")),
                "badge": "Product Launch",
                "badge_color": "amber",
            })
    except Exception as e:
        print(f"Product signal error for {company}: {e}")
    return signals[:3]


async def _headcount_signals(company: str) -> list:
    signals = []
    try:
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(None, _ddgs_search,
            f'"{company}" "expanding team" OR "growing" OR "headcount" OR "50 employees" OR "100 employees" 2025 OR 2026', 3)
        for r in results:
            signals.append({
                "type": "headcount",
                "company": company,
                "title": r.get("title", "")[:120],
                "description": r.get("body", "")[:300],
                "url": r.get("href", ""),
                "date": _parse_date_hint(r.get("body", "")),
                "badge": "Team Growth",
                "badge_color": "cyan",
            })
    except Exception as e:
        print(f"Headcount signal error for {company}: {e}")
    return signals[:2]


async def _job_opening_signals(company: str, roles: list) -> list:
    signals = []
    for role in roles[:2]:
        try:
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(None, _ddgs_search,
                f'"{company}" "{role}" hiring 2025 OR 2026', 3)
            for r in results:
                signals.append({
                    "type": "job_opening",
                    "company": company,
                    "title": r.get("title", "")[:120],
                    "description": r.get("body", "")[:300],
                    "url": r.get("href", ""),
                    "date": _parse_date_hint(r.get("body", "")),
                    "badge": "Open Role",
                    "badge_color": "red",
                    "matched_role": role,
                })
        except Exception as e:
            print(f"Job opening signal error: {e}")
    return signals[:4]
