# Job Info Finder — Claude Context

## Purpose
Full-stack job hunting platform: scrapes job postings/hiring posts across 9 platforms, enriches with real dates via ATS APIs, and uses Claude AI to draft personalized outreach.

## Stack
- **Backend:** Python 3, FastAPI, SQLAlchemy (SQLite dev / PostgreSQL prod via `DATABASE_URL`)
- **Frontend:** Next.js 15, React 18, TypeScript, Tailwind CSS, Framer Motion
- **AI:** Anthropic Claude (`claude_service.py`)
- **Scraping:** DuckDuckGo (`ddgs`), Playwright (LinkedIn auth), httpx + BeautifulSoup
- **ATS APIs:** Greenhouse (`boards-api.greenhouse.io`), Lever (`api.lever.co`) for real posting dates
- **Auth:** JWT (python-jose), bcrypt passwords, Fernet encryption for stored LinkedIn creds
- **Deploy:** Railway (backend) + Vercel (frontend)

## File Map
| Path | Purpose |
|---|---|
| `backend/main.py` | FastAPI app, CORS setup, router registration |
| `backend/services/scraper.py` | Orchestrates all scrapers, normalizes `posted_at`, sorts results |
| `backend/services/linkedin_auth_scraper.py` | Playwright login, stealth patches, Fernet cred encryption, session cookie cache (20h TTL) |
| `backend/services/jobboards_scraper.py` | DDG discovers ATS URLs → Greenhouse/Lever APIs enrich with real dates |
| `backend/services/funded_scraper.py` | TechCrunch URL date parsing (`/YYYY/MM/DD/` pattern), funding news |
| `backend/services/hn_scraper.py` | HN Algolia API for exact UTC timestamps |
| `backend/services/remoteok_scraper.py` | RemoteOK JSON API with `epoch` timestamps |
| `backend/services/reddit_scraper.py` | Reddit JSON API with `created_utc` timestamps |
| `backend/services/wellfound_scraper.py` | DDG `site:wellfound.com` (JS-rendered, no direct scrape) |
| `backend/services/yc_scraper.py` | DDG `site:workatastartup.com` (JS-rendered, no direct scrape) |
| `backend/routers/auth.py` | Login, profile, LinkedIn credential CRUD + test endpoints |
| `backend/routers/jobs.py` | Job listing, scrape trigger (sync + background), status updates |
| `backend/models/user.py` | User model; `scraping_preferences` JSON col stores encrypted LinkedIn creds |
| `frontend/app/jobs/page.tsx` | Main jobs UI: scrape modal with platform selector, job table |
| `frontend/app/settings/page.tsx` | Settings: profile, target roles, Hunter.io key, LinkedIn credential UI |
| `railway.toml` | Railway build (installs Playwright Chromium) + start command |

## Environment Variables
```
# Required
ANTHROPIC_API_KEY=           # Claude API
JWT_SECRET_KEY=              # 32+ char random secret
DATABASE_URL=                # sqlite:///./job_finder.db  OR  postgresql://...
CREDENTIAL_ENCRYPTION_KEY=   # Fernet key for LinkedIn password storage
                             # Generate: python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# Optional
HUNTER_IO_API_KEY=           # Email finding
ADMIN_EMAIL=admin@...        # Seeded admin account
ADMIN_PASSWORD=changeme123
CORS_ORIGINS=https://your-frontend.vercel.app
```

## CLI / Entry Points
```bash
# Backend (dev)
cd backend && uvicorn backend.main:app --reload --port 8000

# Frontend (dev)
cd frontend && npm run dev          # http://localhost:3000

# Run a specific scraper test
backend/venv/bin/python -c "import asyncio; from backend.services.jobboards_scraper import scrape_jobboards; print(asyncio.run(scrape_jobboards(['software engineer'], limit_per_platform=5)))"
```

## Key Design Decisions
- **DDG-first discovery:** All scrapers use DuckDuckGo search to find relevant URLs, then enrich via APIs — avoids JS-rendering issues and 403s
- **ATS date enrichment:** Greenhouse `first_published` and Lever `createdAt` fields return exact dates; DDG snippet hints used as fallback for Ashby/Workable/Rippling
- **`posted_at` normalization:** `scraper.py` `_sort_key()` handles both `datetime` objects and ISO strings from different scrapers
- **LinkedIn auth safety:** Session cookies cached 20h, stealth navigator patches, human-like delays; credentials Fernet-encrypted in `user.scraping_preferences`
- **Registration closed:** `POST /auth/register` returns 403; users added via admin panel only
- **`limit_per_platform` + `date_preset`:** All scrapers accept these params; `date_preset` maps to DDG `timelimit` ("1h"→"h", "7d"→"w", etc.)

## Deploy
- **Backend:** Railway auto-deploys on push to `main`; Playwright Chromium installed at build time
- **Frontend:** Vercel auto-deploys; set `NEXT_PUBLIC_API_URL` to Railway backend URL
- **Add env vars:** Railway Dashboard → Variables; must add `CREDENTIAL_ENCRYPTION_KEY` for LinkedIn feature

## Last Updated
2026-03-16
