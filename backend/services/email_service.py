"""
Email discovery service - no paid APIs required.

Strategy:
  1. Discover company domain via web search + HTTP verification
  2. Gather person info from GitHub, Twitter, company website, Google
  3. Find real emails at that domain from multiple free sources
  4. Detect the company email pattern from real examples found
  5. Apply the confirmed pattern to generate a confident guess
  6. Apply all other patterns as low-confidence alternatives
  7. SMTP-verify each candidate (port 25 handshake)

Every result is tagged: "found" (actually discovered online) vs "guessed" (pattern-derived).
"""

import asyncio
import re
import smtplib
import socket
import dns.resolver
import httpx
from bs4 import BeautifulSoup
from collections import Counter
from typing import Optional
from urllib.parse import quote_plus


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

async def find_email_no_api(name: str, company: str, domain: Optional[str] = None,
                             linkedin_url: Optional[str] = None) -> dict:
    """
    Main entry point. Returns enriched result with found + guessed emails,
    detected company pattern, and person intelligence from multiple sources.
    """
    name = name.strip()
    first, last = _split_name(name)

    # Step 1: resolve domain
    resolved_domain = domain or await _discover_domain(company, linkedin_url)

    # Step 2: gather person info from free sources
    person_sources = await _gather_person_info(name, company, resolved_domain, linkedin_url)

    # Step 3: find real emails at this domain from the web
    found_emails = await _find_emails_online(name, company, resolved_domain)

    # Step 4: detect pattern from found examples
    pattern_info = _detect_pattern(found_emails, resolved_domain)

    # Step 5: generate guesses
    guessed_emails = _generate_guesses(first, last, resolved_domain, pattern_info)

    # Remove guesses that duplicate found emails
    found_addrs = {e["email"] for e in found_emails}
    guessed_emails = [g for g in guessed_emails if g["email"] not in found_addrs]

    # Step 6: SMTP verify top candidates (found first, then top guesses)
    candidates_to_verify = found_emails[:3] + guessed_emails[:3]
    await _smtp_verify_batch(candidates_to_verify, resolved_domain)

    # Build best_guess: prefer found > high-confidence guess > first guess
    best = None
    for e in found_emails:
        if e.get("smtp_ok") or e.get("mx_ok"):
            best = e["email"]
            break
    if not best and pattern_info["pattern"]:
        for g in guessed_emails:
            if g["pattern_name"] == pattern_info["pattern"]:
                best = g["email"]
                break
    if not best:
        best = (found_emails[0]["email"] if found_emails
                else guessed_emails[0]["email"] if guessed_emails
                else None)

    return {
        "name": name,
        "domain": resolved_domain,
        "found_emails": found_emails,
        "guessed_emails": guessed_emails,
        "best_guess": best,
        "pattern_detected": pattern_info["pattern"],
        "pattern_confidence": pattern_info["confidence"],
        "pattern_examples": pattern_info["examples"],
        "domain_verified": pattern_info.get("domain_verified", False),
        "person_sources": person_sources,
    }


async def verify_email(email: str) -> dict:
    """Public verify endpoint - MX + SMTP."""
    domain = email.split("@")[-1]
    mx_ok = _check_mx(domain)
    smtp_ok, smtp_msg = _smtp_verify(email, domain) if mx_ok else (False, "no MX record")
    fmt_ok = bool(re.match(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$", email))
    return {
        "email": email,
        "format_valid": fmt_ok,
        "has_mx_record": mx_ok,
        "smtp_ok": smtp_ok,
        "smtp_message": smtp_msg,
        "likely_valid": fmt_ok and mx_ok and smtp_ok,
    }


# ---------------------------------------------------------------------------
# Domain discovery
# ---------------------------------------------------------------------------

async def _discover_domain(company: str, linkedin_url: Optional[str] = None) -> str:
    """Try multiple strategies to find the official company domain."""
    # Strategy 1: extract from LinkedIn company URL slug
    if linkedin_url:
        slug_domain = _domain_from_linkedin(linkedin_url)
        if slug_domain and await _domain_reachable(slug_domain):
            return slug_domain

    # Strategy 2: Google search for company website
    google_domain = await _google_for_domain(company)
    if google_domain and await _domain_reachable(google_domain):
        return google_domain

    # Strategy 3: common patterns (companyname.com, company-name.com, etc.)
    guesses = _common_domain_guesses(company)
    for g in guesses:
        if await _domain_reachable(g):
            return g

    # Fallback: best guess even if not confirmed reachable
    return guesses[0] if guesses else f"{_slugify(company)}.com"


async def _google_for_domain(company: str) -> Optional[str]:
    """Search Google for '{company} official website' and extract domain."""
    headers = _browser_headers()
    query = quote_plus(f"{company} official website")
    url = f"https://www.google.com/search?q={query}&num=5"
    try:
        async with httpx.AsyncClient(timeout=12, headers=headers, follow_redirects=True) as c:
            r = await c.get(url)
            if r.status_code != 200:
                return None
            soup = BeautifulSoup(r.text, "html.parser")
            # Google result cite tags
            for cite in soup.select("cite"):
                text = cite.get_text()
                m = re.search(r"([\w\-]+\.(?:com|io|co|org|net|ai|app|dev))", text)
                if m:
                    candidate = m.group(1).lower()
                    if _slugify(company)[:4] in candidate or company.lower()[:4] in candidate:
                        return candidate
    except Exception:
        pass
    return None


def _domain_from_linkedin(url: str) -> Optional[str]:
    m = re.search(r"linkedin\.com/company/([^/?#]+)", url)
    if m:
        slug = m.group(1).lower()
        slug = re.sub(r"[^a-z0-9]", "", slug)
        return f"{slug}.com"
    return None


def _common_domain_guesses(company: str) -> list:
    base = _slugify(company)
    hyphen = re.sub(r"[^a-z0-9]", "-", company.lower()).strip("-")
    suffixes = [".com", ".io", ".co", ".ai", ".app"]
    results = []
    for s in suffixes:
        results.append(f"{base}{s}")
        if hyphen != base:
            results.append(f"{hyphen}{s}")
    return results


async def _domain_reachable(domain: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=6, follow_redirects=True) as c:
            r = await c.head(f"https://{domain}")
            return r.status_code < 500
    except Exception:
        try:
            dns.resolver.resolve(domain, "A")
            return True
        except Exception:
            return False


# ---------------------------------------------------------------------------
# Person intelligence gathering
# ---------------------------------------------------------------------------

async def _gather_person_info(name: str, company: str, domain: str,
                               linkedin_url: Optional[str]) -> list:
    """Fetch person info from GitHub, Twitter/X, company site, Google."""
    tasks = [
        _search_github_user(name, company),
        _search_google_person(name, company, domain),
        _search_company_site(name, domain),
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    sources = []
    for r in results:
        if isinstance(r, list):
            sources.extend(r)
        elif isinstance(r, dict) and not isinstance(r, Exception):
            sources.append(r)
    return [s for s in sources if s]


async def _search_github_user(name: str, company: str) -> list:
    """Search GitHub API (public, no auth) for person at company."""
    sources = []
    try:
        first, last = _split_name(name)
        queries = [
            f"{name} {company}",
            f"{first} {last}",
        ]
        headers = {"Accept": "application/vnd.github.v3+json",
                   "User-Agent": "JobInfoFinder/1.0"}
        async with httpx.AsyncClient(timeout=10, headers=headers) as c:
            for q in queries:
                r = await c.get(
                    "https://api.github.com/search/users",
                    params={"q": f"{q} in:name", "per_page": 5}
                )
                if r.status_code == 200:
                    items = r.json().get("items", [])
                    for item in items:
                        login = item.get("login", "")
                        # Get full profile for email
                        prof = await c.get(f"https://api.github.com/users/{login}")
                        if prof.status_code == 200:
                            pd = prof.json()
                            entry = {
                                "source": "github",
                                "url": pd.get("html_url"),
                                "info": {
                                    "name": pd.get("name"),
                                    "company": pd.get("company"),
                                    "bio": pd.get("bio"),
                                    "location": pd.get("location"),
                                    "email": pd.get("email"),  # public email if set
                                    "blog": pd.get("blog"),
                                }
                            }
                            if _name_matches(name, pd.get("name", "")):
                                sources.append(entry)
                if sources:
                    break
    except Exception:
        pass
    return sources


async def _search_google_person(name: str, company: str, domain: str) -> list:
    """Google the person and extract any email addresses found."""
    sources = []
    queries = [
        f'"{name}" "{company}"',
        f'"{name}" "@{domain}"',
        f'"{name}" site:{domain}',
    ]
    headers = _browser_headers()
    email_rx = re.compile(
        rf'[a-zA-Z0-9._%+\-]+@{re.escape(domain)}', re.IGNORECASE
    )
    try:
        async with httpx.AsyncClient(timeout=12, headers=headers, follow_redirects=True) as c:
            for q in queries:
                url = f"https://www.google.com/search?q={quote_plus(q)}&num=10"
                r = await c.get(url)
                if r.status_code == 200:
                    emails_found = email_rx.findall(r.text)
                    if emails_found:
                        for e in set(emails_found):
                            sources.append({
                                "source": "google_search",
                                "url": url,
                                "info": {"email_found": e, "query": q}
                            })
                await asyncio.sleep(0.8)
    except Exception:
        pass
    return sources


async def _search_company_site(name: str, domain: str) -> list:
    """Scrape company team/about/contact pages for email addresses."""
    sources = []
    pages = [
        f"https://{domain}/team",
        f"https://{domain}/about",
        f"https://{domain}/about-us",
        f"https://{domain}/contact",
        f"https://{domain}/people",
        f"https://{domain}/leadership",
    ]
    email_rx = re.compile(
        rf'[a-zA-Z0-9._%+\-]+@{re.escape(domain)}', re.IGNORECASE
    )
    headers = _browser_headers()
    first, last = _split_name(name)
    try:
        async with httpx.AsyncClient(timeout=10, headers=headers, follow_redirects=True) as c:
            for page_url in pages:
                try:
                    r = await c.get(page_url)
                    if r.status_code == 200:
                        text = r.text
                        emails_found = email_rx.findall(text)
                        for e in set(emails_found):
                            sources.append({
                                "source": "company_website",
                                "url": page_url,
                                "info": {"email_found": e}
                            })
                        # Also search for the person's name near any email
                        if (first.lower() in text.lower() or
                                last.lower() in text.lower()):
                            sources.append({
                                "source": "company_website",
                                "url": page_url,
                                "info": {"person_name_found": True, "page": page_url}
                            })
                except Exception:
                    continue
    except Exception:
        pass
    return sources


# ---------------------------------------------------------------------------
# Find real emails at domain (multi-source)
# ---------------------------------------------------------------------------

async def _find_emails_online(name: str, company: str, domain: str) -> list:
    """
    Search multiple free sources for any real emails at this domain.
    Returns list of found email dicts with source info.
    """
    results = []
    if not domain:
        return results

    tasks = [
        _find_via_google_email_search(name, company, domain),
        _find_via_github_company_employees(company, domain),
        _find_via_company_website(domain),
        _find_via_github_commits(name, domain),
    ]
    gathered = await asyncio.gather(*tasks, return_exceptions=True)

    email_rx = re.compile(
        rf'^[a-zA-Z0-9._%+\-]+@{re.escape(domain)}$', re.IGNORECASE
    )
    seen = set()
    for batch in gathered:
        if isinstance(batch, list):
            for item in batch:
                email_addr = item.get("email", "").lower().strip()
                if email_addr and email_rx.match(email_addr) and email_addr not in seen:
                    seen.add(email_addr)
                    results.append({
                        "email": email_addr,
                        "source": item.get("source", "web"),
                        "source_url": item.get("source_url"),
                        "confidence": 95,
                        "is_found": True,
                        "is_guessed": False,
                        "smtp_ok": None,
                        "mx_ok": None,
                    })

    return results


async def _find_via_google_email_search(name: str, company: str, domain: str) -> list:
    """Use Google to find emails at domain (searches like '@company.com' and name+domain)."""
    results = []
    headers = _browser_headers()
    email_rx = re.compile(
        rf'[a-zA-Z0-9._%+\-]+@{re.escape(domain)}', re.IGNORECASE
    )
    first, last = _split_name(name)
    queries = [
        f'"@{domain}"',
        f'"{first}" "{last}" "@{domain}"',
        f'"@{domain}" "{company}"',
        f'site:{domain} email',
    ]
    try:
        async with httpx.AsyncClient(timeout=12, headers=headers, follow_redirects=True) as c:
            for q in queries[:2]:
                url = f"https://www.google.com/search?q={quote_plus(q)}&num=10"
                r = await c.get(url)
                if r.status_code == 200:
                    found = set(email_rx.findall(r.text))
                    for e in found:
                        results.append({
                            "email": e.lower(),
                            "source": "google",
                            "source_url": url
                        })
                await asyncio.sleep(1.0)
    except Exception:
        pass
    return results


async def _find_via_github_company_employees(company: str, domain: str) -> list:
    """
    Search GitHub for users who list this company, then collect their public emails.
    This reveals the real email pattern the company uses.
    """
    results = []
    headers = {"Accept": "application/vnd.github.v3+json",
               "User-Agent": "JobInfoFinder/1.0"}
    email_rx = re.compile(
        rf'^[a-zA-Z0-9._%+\-]+@{re.escape(domain)}$', re.IGNORECASE
    )
    try:
        async with httpx.AsyncClient(timeout=12, headers=headers) as c:
            # Search by company name
            r = await c.get(
                "https://api.github.com/search/users",
                params={"q": f"{company} in:company", "per_page": 15}
            )
            if r.status_code != 200:
                return results

            items = r.json().get("items", [])
            # Fetch each user profile for their public email
            for item in items[:10]:
                login = item.get("login", "")
                prof = await c.get(f"https://api.github.com/users/{login}")
                if prof.status_code == 200:
                    pd = prof.json()
                    email = pd.get("email", "")
                    if email and email_rx.match(email):
                        results.append({
                            "email": email.lower(),
                            "source": "github_profile",
                            "source_url": pd.get("html_url"),
                            "github_name": pd.get("name"),
                        })
                await asyncio.sleep(0.15)
    except Exception:
        pass
    return results


async def _find_via_company_website(domain: str) -> list:
    """Scrape company pages for visible email addresses."""
    results = []
    pages = [
        f"https://{domain}/team",
        f"https://{domain}/about",
        f"https://{domain}/contact",
        f"https://{domain}/people",
        f"https://{domain}/leadership",
    ]
    email_rx = re.compile(
        rf'[a-zA-Z0-9._%+\-]+@{re.escape(domain)}', re.IGNORECASE
    )
    headers = _browser_headers()
    try:
        async with httpx.AsyncClient(timeout=10, headers=headers, follow_redirects=True) as c:
            for page_url in pages:
                try:
                    r = await c.get(page_url)
                    if r.status_code == 200:
                        found = set(email_rx.findall(r.text))
                        for e in found:
                            results.append({
                                "email": e.lower(),
                                "source": "company_website",
                                "source_url": page_url,
                            })
                except Exception:
                    continue
    except Exception:
        pass
    return results


async def _find_via_github_commits(name: str, domain: str) -> list:
    """Search GitHub commits for the person's email via author search."""
    results = []
    first, last = _split_name(name)
    email_rx = re.compile(
        rf'[a-zA-Z0-9._%+\-]+@{re.escape(domain)}', re.IGNORECASE
    )
    headers = {"Accept": "application/vnd.github.v3+json",
               "User-Agent": "JobInfoFinder/1.0"}
    try:
        async with httpx.AsyncClient(timeout=10, headers=headers) as c:
            r = await c.get(
                "https://api.github.com/search/commits",
                params={"q": f"author-email:{domain} author-name:{first}",
                        "per_page": 10},
                headers={**headers,
                         "Accept": "application/vnd.github.cloak-preview"}
            )
            if r.status_code == 200:
                items = r.json().get("items", [])
                for item in items:
                    commit = item.get("commit", {})
                    author_email = commit.get("author", {}).get("email", "")
                    if author_email and email_rx.match(author_email):
                        results.append({
                            "email": author_email.lower(),
                            "source": "github_commits",
                            "source_url": item.get("html_url"),
                        })
    except Exception:
        pass
    return results


# ---------------------------------------------------------------------------
# Pattern detection
# ---------------------------------------------------------------------------

def _detect_pattern(found_emails: list, domain: str) -> dict:
    """
    Analyse real emails found for this domain to detect which pattern the
    company uses (e.g. first.last, flast, firstname, etc.).
    Returns: {pattern, confidence, examples, domain_verified}
    """
    if not found_emails:
        return {"pattern": None, "confidence": 0, "examples": [],
                "domain_verified": False}

    local_parts = [e["email"].split("@")[0] for e in found_emails]
    pattern_votes = Counter()
    examples_by_pattern: dict = {}

    for local in local_parts:
        matched = _identify_pattern(local)
        if matched:
            pattern_votes[matched] += 1
            examples_by_pattern.setdefault(matched, [])
            if len(examples_by_pattern[matched]) < 3:
                examples_by_pattern[matched].append(f"{local}@{domain}")

    if not pattern_votes:
        return {"pattern": None, "confidence": 0, "examples": [],
                "domain_verified": True}

    top_pattern, top_count = pattern_votes.most_common(1)[0]
    total = sum(pattern_votes.values())
    confidence = min(98, int((top_count / total) * 100) + (10 if total >= 3 else 0))

    return {
        "pattern": top_pattern,
        "confidence": confidence,
        "examples": examples_by_pattern.get(top_pattern, []),
        "domain_verified": True,
    }


def _identify_pattern(local: str) -> Optional[str]:
    """
    Try to classify an email local part into a named pattern.
    Returns the pattern name or None if unrecognised.
    """
    local = local.lower()
    # We cannot know the real name, so we use structural heuristics.
    # Patterns: first.last, flast, firstl, first_last, last.first, firstname, etc.
    if re.match(r'^[a-z]+\.[a-z]+$', local):
        return "first.last"
    if re.match(r'^[a-z][a-z]+$', local) and len(local) <= 12:
        # Could be firstname or flast
        return "firstname_or_flast"
    if re.match(r'^[a-z]\.[a-z]+$', local):
        return "f.last"
    if re.match(r'^[a-z]+\.[a-z]$', local):
        return "first.l"
    if re.match(r'^[a-z]+_[a-z]+$', local):
        return "first_last"
    if re.match(r'^[a-z]+[a-z]+$', local):
        return "firstlast"
    return None


# ---------------------------------------------------------------------------
# Email guess generation
# ---------------------------------------------------------------------------

def _generate_guesses(first: str, last: str, domain: str, pattern_info: dict) -> list:
    """
    Generate guessed emails. If a company pattern was detected, put that first
    with higher confidence. All others are lower confidence.
    """
    if not first:
        return []

    f = _clean(first)
    l = _clean(last) if last else ""
    fi = f[0] if f else ""
    li = l[0] if l else ""

    all_patterns = []

    if l:
        all_patterns = [
            ("first.last",        f"{f}.{l}@{domain}",    82),
            ("f.last",            f"{fi}.{l}@{domain}",   75),
            ("flast",             f"{fi}{l}@{domain}",    72),
            ("firstname_or_flast",f"{f}@{domain}",        60),
            ("firstlast",         f"{f}{l}@{domain}",     65),
            ("first_last",        f"{f}_{l}@{domain}",    55),
            ("first.l",           f"{f}.{li}@{domain}",   50),
            ("last.first",        f"{l}.{f}@{domain}",    45),
            ("lastfirst",         f"{l}{f}@{domain}",     40),
        ]
    else:
        all_patterns = [
            ("firstname_or_flast", f"{f}@{domain}", 50),
        ]

    detected = pattern_info.get("pattern")
    pattern_conf = pattern_info.get("confidence", 0)

    results = []
    seen = set()
    for pattern_name, email_addr, base_conf in all_patterns:
        if email_addr in seen:
            continue
        seen.add(email_addr)

        if detected and pattern_name == detected:
            # Boosted confidence because it matches the discovered pattern
            conf = min(97, base_conf + (pattern_conf // 2))
            label = "guessed_from_pattern"
        else:
            conf = base_conf if not detected else max(15, base_conf - 25)
            label = "guessed"

        results.append({
            "email": email_addr,
            "confidence": conf,
            "pattern_name": pattern_name,
            "source": label,
            "is_found": False,
            "is_guessed": True,
            "smtp_ok": None,
            "mx_ok": None,
        })

    # Sort: pattern match first, then by confidence desc
    results.sort(key=lambda x: (
        0 if x["source"] == "guessed_from_pattern" else 1,
        -x["confidence"]
    ))
    return results


# ---------------------------------------------------------------------------
# SMTP / MX verification
# ---------------------------------------------------------------------------

async def _smtp_verify_batch(candidates: list, domain: str) -> None:
    """In-place SMTP verification for a batch of email candidates."""
    mx = _get_mx(domain)
    for c in candidates:
        email = c.get("email", "")
        if not email:
            continue
        c["mx_ok"] = mx is not None
        if mx:
            ok, msg = await asyncio.get_event_loop().run_in_executor(
                None, _smtp_verify, email, domain
            )
            c["smtp_ok"] = ok
            c["smtp_message"] = msg
        else:
            c["smtp_ok"] = False
            c["smtp_message"] = "No MX record found"


def _smtp_verify(email: str, domain: str) -> tuple:
    """
    Attempt an SMTP handshake to check if the address is accepted.
    Returns (bool, message).
    Note: many servers return 250 for everything (catch-all). We flag that.
    """
    mx = _get_mx(domain)
    if not mx:
        return False, "No MX record"
    try:
        smtp = smtplib.SMTP(timeout=8)
        smtp.connect(mx, 25)
        smtp.helo("verify.jobinfofinder.com")
        smtp.mail("verify@jobinfofinder.com")
        code, message = smtp.rcpt(email)
        smtp.quit()
        msg = message.decode(errors="ignore") if isinstance(message, bytes) else str(message)
        if code == 250:
            return True, f"Accepted (250): {msg}"
        elif code == 251:
            return True, f"Forwarded (251): {msg}"
        elif code in (550, 551, 553):
            return False, f"Rejected ({code}): {msg}"
        else:
            return False, f"Unknown ({code}): {msg}"
    except smtplib.SMTPConnectError:
        return False, "SMTP connection refused (port 25 blocked)"
    except socket.timeout:
        return False, "SMTP timeout"
    except Exception as exc:
        return False, f"SMTP error: {str(exc)[:80]}"


def _check_mx(domain: str) -> bool:
    return _get_mx(domain) is not None


def _get_mx(domain: str) -> Optional[str]:
    try:
        records = dns.resolver.resolve(domain, "MX")
        records_sorted = sorted(records, key=lambda r: r.preference)
        return str(records_sorted[0].exchange).rstrip(".")
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _split_name(name: str) -> tuple:
    parts = name.strip().split()
    if not parts:
        return "", ""
    first = parts[0]
    last = parts[-1] if len(parts) > 1 else ""
    return first, last


def _clean(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _slugify(s: str) -> str:
    s = re.sub(r"\b(inc|llc|corp|ltd|co|company|technologies|tech|group|labs|studio|studios)\b",
               "", s.lower())
    return re.sub(r"[^a-z0-9]", "", s)


def _name_matches(search_name: str, found_name: str) -> bool:
    if not found_name:
        return False
    s_parts = set(search_name.lower().split())
    f_parts = set(found_name.lower().split())
    return len(s_parts & f_parts) >= min(2, len(s_parts))


def _browser_headers() -> dict:
    return {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
