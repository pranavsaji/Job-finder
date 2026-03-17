"""
Company intelligence signals: funding rounds, GitHub activity,
exec hires, product launches. All free/public sources.
"""
import asyncio
import re
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional


def _ddgs_search(query: str, max_results: int = 5) -> list:
    try:
        from ddgs import DDGS
        ddgs = DDGS(timeout=15)
        return list(ddgs.text(query, max_results=max_results))
    except Exception as e:
        print(f"DDG signals error: {e}")
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
    """Broad scan: find companies showing hiring signals for given roles."""
    loop = asyncio.get_event_loop()
    all_signals = []

    for role in roles[:3]:
        results = await loop.run_in_executor(None, _ddgs_search,
            f'"{role}" hiring "series" OR "raised" OR "expands" team 2025 OR 2026', 8)
        for r in results:
            company_guess = _extract_company_from_snippet(r.get("title", ""), r.get("body", ""))
            if not company_guess:
                continue
            all_signals.append({
                "type": "hiring_signal",
                "company": company_guess,
                "title": r.get("title", "")[:120],
                "description": r.get("body", "")[:300],
                "url": r.get("href", ""),
                "date": _parse_date_hint(r.get("body", "")),
                "badge": "Hiring Signal",
                "badge_color": "green",
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


def _extract_company_from_snippet(title: str, body: str) -> Optional[str]:
    patterns = [
        r"^([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)?)\s+(?:raises|secures|hires|launches|announces)",
        r"([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)?)\s+is\s+hiring",
    ]
    for pat in patterns:
        m = re.search(pat, title)
        if m:
            c = m.group(1).strip()
            if 1 <= len(c.split()) <= 4:
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
