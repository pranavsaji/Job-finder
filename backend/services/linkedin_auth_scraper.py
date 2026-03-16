"""
LinkedIn authenticated scraper using Playwright.

Uses the user's own LinkedIn account to search for hiring posts — gets real
dates, poster names, and content that DDG cannot access.

⚠️  Risk: LinkedIn may challenge the login with CAPTCHA or email verification
if they detect unusual activity. We mitigate this by:
- Reusing saved session cookies (only logs in when session expires)
- Adding human-like delays
- Using a realistic browser fingerprint
- Limiting requests per session
"""

import asyncio
import json
import os
import re
import random
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

COOKIES_PATH = Path("/tmp/li_session_cookies.json")


# ─── Stealth helpers ──────────────────────────────────────────────────────────

async def _apply_stealth(page):
    """Patch the page to hide Playwright / headless indicators."""
    await page.add_init_script("""
        // Remove webdriver property
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        // Spoof plugins
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });
        // Spoof languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en'],
        });
        // Spoof permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) =>
            parameters.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission })
                : originalQuery(parameters);
        // Remove HeadlessChrome from user-agent data
        Object.defineProperty(navigator, 'userAgentData', {
            get: () => undefined,
        });
    """)


async def _human_delay(min_ms=800, max_ms=2200):
    await asyncio.sleep(random.uniform(min_ms, max_ms) / 1000)


async def _type_like_human(page, selector: str, text: str):
    """Type text with random delays between characters."""
    await page.click(selector)
    for char in text:
        await page.keyboard.type(char)
        await asyncio.sleep(random.uniform(0.05, 0.18))


# ─── Session management ───────────────────────────────────────────────────────

def _load_cookies() -> Optional[list]:
    try:
        if COOKIES_PATH.exists():
            data = json.loads(COOKIES_PATH.read_text())
            # Check expiry
            expires = data.get("expires_at", 0)
            if expires > datetime.now(timezone.utc).timestamp():
                return data.get("cookies", [])
    except Exception:
        pass
    return None


def _save_cookies(cookies: list):
    try:
        COOKIES_PATH.write_text(json.dumps({
            "cookies": cookies,
            # LinkedIn sessions last ~24–72h; be conservative
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=20)).timestamp(),
        }))
    except Exception:
        pass


def clear_session():
    """Force re-login on next scrape."""
    if COOKIES_PATH.exists():
        COOKIES_PATH.unlink()


# ─── Login ────────────────────────────────────────────────────────────────────

async def _login(page, email: str, password: str) -> bool:
    """Log into LinkedIn. Returns True on success."""
    await page.goto("https://www.linkedin.com/login", wait_until="domcontentloaded", timeout=20000)
    await _human_delay(1000, 2000)

    try:
        await page.fill("#username", email)
        await _human_delay(300, 700)
        await page.fill("#password", password)
        await _human_delay(400, 900)
        await page.click('[data-litms-control-urn="login-submit"]', timeout=5000)
    except Exception:
        await page.click("button[type=submit]", timeout=5000)

    await _human_delay(2000, 4000)

    url = page.url
    if "feed" in url or "mynetwork" in url or "jobs" in url:
        return True
    if "checkpoint" in url or "challenge" in url or "captcha" in url:
        return False  # CAPTCHA / verification required
    if "login" not in url:
        return True  # Redirected away from login — probably success
    return False


# ─── Search ───────────────────────────────────────────────────────────────────

async def _search_hiring_posts(page, role: str, date_preset: Optional[str]) -> list:
    """Search LinkedIn for hiring posts matching role."""
    posts = []

    # Map date preset to LinkedIn's date filter
    date_filter = ""
    if date_preset in ("1h", "24h"):
        date_filter = "&datePosted=past-24h"
    elif date_preset == "7d":
        date_filter = "&datePosted=past-week"
    elif date_preset == "30d":
        date_filter = "&datePosted=past-month"

    queries = [
        f'we are hiring "{role}"',
        f'my team is hiring "{role}"',
        f'"{role}" join us hiring',
    ]

    for query in queries[:2]:
        encoded = query.replace(" ", "%20").replace('"', "%22")
        url = f"https://www.linkedin.com/search/results/content/?keywords={encoded}&origin=GLOBAL_SEARCH_HEADER{date_filter}"
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            await _human_delay(2000, 3500)

            # Scroll a bit to load more posts
            for _ in range(2):
                await page.evaluate("window.scrollBy(0, 600)")
                await _human_delay(800, 1500)

            posts.extend(await _extract_posts_from_page(page, role))
        except Exception as e:
            print(f"LinkedIn auth search error for '{query}': {e}")

    return posts


async def _extract_posts_from_page(page, role: str) -> list:
    """Extract hiring post data from the current search results page."""
    posts = []
    try:
        # LinkedIn content search results
        cards = await page.query_selector_all(
            '[data-urn*="activity"], .search-content__result, '
            '.occludable-update, [data-id*="urn:li:activity"]'
        )

        for card in cards[:15]:
            try:
                post = await _extract_one_post(card, role)
                if post:
                    posts.append(post)
            except Exception:
                continue
    except Exception as e:
        print(f"LinkedIn extract error: {e}")
    return posts


async def _extract_one_post(card, role: str) -> Optional[dict]:
    """Extract data from a single LinkedIn post card."""
    try:
        # Post content text
        content_el = await card.query_selector(
            '.feed-shared-update-v2__description, '
            '.search-content__result-text, '
            '[class*="commentary"], '
            'span[dir="ltr"]'
        )
        content = (await content_el.inner_text()).strip() if content_el else ""

        if not content or len(content) < 20:
            return None

        # Check it's a hiring post
        content_lower = content.lower()
        if not any(kw in content_lower for kw in [
            "hiring", "we're hiring", "we are hiring", "join our team",
            "looking for", "open role", "open position", "dm me", "apply",
        ]):
            return None

        # Author name
        author_el = await card.query_selector(
            '.update-components-actor__name, '
            '[class*="actor__name"], '
            '.search-content__result-author-name'
        )
        author = (await author_el.inner_text()).strip() if author_el else None

        # Author title/headline
        title_el = await card.query_selector(
            '.update-components-actor__description, '
            '[class*="actor__description"]'
        )
        poster_title = (await title_el.inner_text()).strip() if title_el else None

        # Posted time
        time_el = await card.query_selector(
            'time, [class*="time-ago"], [aria-label*="ago"], '
            '.update-components-actor__sub-description'
        )
        time_text = (await time_el.inner_text()).strip() if time_el else ""
        posted_at = _parse_li_time(time_text)

        # Post URL
        link_el = await card.query_selector('a[href*="/feed/update/"], a[href*="activity"]')
        post_url = ""
        if link_el:
            post_url = await link_el.get_attribute("href") or ""
            if post_url and not post_url.startswith("http"):
                post_url = "https://www.linkedin.com" + post_url

        # Author profile URL
        profile_el = await card.query_selector('a[href*="/in/"]')
        profile_url = ""
        if profile_el:
            profile_url = await profile_el.get_attribute("href") or ""
            if profile_url and not profile_url.startswith("http"):
                profile_url = "https://www.linkedin.com" + profile_url

        # Company extraction
        company = _extract_company(content)

        if not post_url:
            return None

        return {
            "title": _extract_role(content, role),
            "company": company,
            "poster_name": author,
            "poster_title": poster_title,
            "poster_profile_url": profile_url or None,
            "poster_linkedin": profile_url or None,
            "post_url": post_url.split("?")[0],  # strip tracking params
            "platform": "linkedin",
            "post_content": content[:2000],
            "posted_at": posted_at,
            "location": _extract_location(content),
            "job_type": _extract_job_type(content),
            "is_remote": "remote" in content_lower,
            "tags": [role] + _extract_skills(content),
            "matched_role": role,
            "salary_range": _extract_salary(content),
        }
    except Exception:
        return None


# ─── Main entry point ─────────────────────────────────────────────────────────

async def scrape_linkedin_authenticated(
    email: str,
    password: str,
    roles: list,
    country: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    limit_per_platform: int = 20,
    date_preset: Optional[str] = None,
) -> dict:
    """
    Scrape LinkedIn using authenticated session.
    Returns {"jobs": [...], "status": "ok"|"captcha"|"login_failed"|"error", "message": "..."}
    """
    from playwright.async_api import async_playwright

    all_jobs = []
    status = "ok"
    message = ""

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                    "--disable-web-security",
                ],
            )
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                locale="en-US",
            )

            # Restore saved session if available
            saved_cookies = _load_cookies()
            if saved_cookies:
                await context.add_cookies(saved_cookies)

            page = await context.new_page()
            await _apply_stealth(page)

            # Check if session is still valid
            logged_in = False
            if saved_cookies:
                await page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded", timeout=20000)
                await _human_delay(1500, 2500)
                if "feed" in page.url or "mynetwork" in page.url:
                    logged_in = True

            if not logged_in:
                logged_in = await _login(page, email, password)
                if not logged_in:
                    url = page.url
                    if "checkpoint" in url or "challenge" in url:
                        await browser.close()
                        return {
                            "jobs": [],
                            "status": "captcha",
                            "message": "LinkedIn requires verification. Please log in manually at linkedin.com once to clear the challenge.",
                        }
                    await browser.close()
                    return {
                        "jobs": [],
                        "status": "login_failed",
                        "message": "Login failed. Check your email and password.",
                    }
                # Save session cookies
                cookies = await context.cookies()
                _save_cookies(cookies)

            # Scrape each role
            for role in roles[:3]:
                try:
                    posts = await _search_hiring_posts(page, role, date_preset)
                    all_jobs.extend(posts)
                    await _human_delay(2000, 4000)
                except Exception as e:
                    print(f"LinkedIn auth role search error for '{role}': {e}")

            await browser.close()

    except Exception as e:
        print(f"LinkedIn auth scraper fatal error: {e}")
        return {"jobs": [], "status": "error", "message": str(e)}

    # Deduplicate
    seen = set()
    unique = []
    for j in all_jobs:
        uid = j.get("post_url", "")
        if uid and uid not in seen:
            seen.add(uid)
            unique.append(j)

    # Date filter
    if date_from:
        unique = [j for j in unique if not j.get("posted_at") or j["posted_at"] >= date_from]

    return {
        "jobs": unique[:limit_per_platform],
        "status": "ok",
        "message": f"Found {len(unique)} LinkedIn posts",
    }


# ─── Credential helpers (Fernet encryption) ───────────────────────────────────

def encrypt_password(plaintext: str) -> str:
    from cryptography.fernet import Fernet
    key = os.environ.get("CREDENTIAL_ENCRYPTION_KEY", "")
    if not key:
        raise ValueError("CREDENTIAL_ENCRYPTION_KEY not set")
    f = Fernet(key.encode())
    return f.encrypt(plaintext.encode()).decode()


def decrypt_password(ciphertext: str) -> str:
    from cryptography.fernet import Fernet
    key = os.environ.get("CREDENTIAL_ENCRYPTION_KEY", "")
    if not key:
        raise ValueError("CREDENTIAL_ENCRYPTION_KEY not set")
    f = Fernet(key.encode())
    return f.decrypt(ciphertext.encode()).decode()


# ─── Text helpers ─────────────────────────────────────────────────────────────

def _parse_li_time(text: str) -> Optional[datetime]:
    now = datetime.now(timezone.utc)
    if not text:
        return None
    m = re.search(r"(\d+)\s*(second|minute|hour|day|week|month)", text, re.IGNORECASE)
    if m:
        n, unit = int(m.group(1)), m.group(2).lower()
        if "second" in unit: return now - timedelta(seconds=n)
        if "minute" in unit: return now - timedelta(minutes=n)
        if "hour" in unit:   return now - timedelta(hours=n)
        if "day" in unit:    return now - timedelta(days=n)
        if "week" in unit:   return now - timedelta(weeks=n)
        if "month" in unit:  return now - timedelta(days=n * 30)
    return None


def _extract_role(text: str, fallback: str) -> str:
    patterns = [
        r"hiring\s+(?:a\s+|an\s+)?([A-Za-z][A-Za-z\s\/\-]+?)(?:\s+at\s|\s+for\s|[!.,\n])",
        r"looking for\s+(?:a\s+|an\s+)?([A-Za-z][A-Za-z\s\/\-]+?)(?:[!.,\n]|$)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if 2 <= len(candidate.split()) <= 6:
                return candidate.title()
    return fallback.title()


def _extract_company(text: str) -> Optional[str]:
    patterns = [
        r"at\s+([A-Z][A-Za-z0-9\s&.]+?)\s*[•·,\.]",
        r"(?:at|@)\s+([A-Z][A-Za-z0-9\s&.]+?)(?:\s+is|\s+we|\s+-|\.|,|!|\n)",
        r"join\s+([A-Z][A-Za-z0-9\s&]+?)(?:\s+as|\s+to|\.|,|!|\n)",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            c = m.group(1).strip()
            if 1 <= len(c.split()) <= 5 and c not in ("LinkedIn", "My", "Our", "We"):
                return c
    return None


def _extract_location(text: str) -> Optional[str]:
    m = re.search(
        r"\b(Remote|New York|San Francisco|London|Berlin|Austin|Seattle|Boston|Toronto|"
        r"NYC|SF|LA|Chicago|Miami|Denver|Singapore|Bangalore|Dubai)\b",
        text, re.IGNORECASE
    )
    return m.group(1) if m else None


def _extract_job_type(text: str) -> Optional[str]:
    tl = text.lower()
    if "contract" in tl or "freelance" in tl: return "contract"
    if "part-time" in tl or "part time" in tl: return "part-time"
    if "internship" in tl or "intern" in tl:   return "internship"
    return "full-time"


def _extract_salary(text: str) -> Optional[str]:
    m = re.search(r"\$[\d,]+k?\s*(?:[-to]+)\s*\$[\d,]+k?|\$\d+[kKmM]", text, re.IGNORECASE)
    return m.group(0) if m else None


def _extract_skills(text: str) -> list:
    skills = ["Python", "React", "TypeScript", "JavaScript", "Go", "Rust", "Java",
              "Kubernetes", "AWS", "GCP", "SQL", "Machine Learning", "AI", "LLM",
              "Node.js", "FastAPI", "Django", "Swift", "Kotlin", "C++"]
    return [s for s in skills if re.search(r"\b" + re.escape(s) + r"\b", text, re.IGNORECASE)][:4]
