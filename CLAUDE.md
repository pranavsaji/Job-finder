# Job Info Finder — Claude Context

## Purpose
Full-stack job hunting platform: scrapes job postings/hiring posts across 9+ platforms, enriches with real dates via ATS APIs, and uses Claude AI to draft outreach, tailor resumes, and generate interview prep packs.

## Stack
- **Backend:** Python 3, FastAPI, SQLAlchemy (SQLite dev / PostgreSQL prod via `DATABASE_URL`)
- **Frontend:** Next.js 15, React 18, TypeScript, Tailwind CSS, Framer Motion
- **AI:** Anthropic Claude (`claude_service.py`, `prep_service.py`)
- **Scraping:** DuckDuckGo (`ddgs`), Playwright (LinkedIn auth), httpx + BeautifulSoup
- **ATS APIs:** Greenhouse (`boards-api.greenhouse.io`), Lever (`api.lever.co`) for real posting dates
- **Auth:** JWT (python-jose), bcrypt passwords, Fernet encryption for stored LinkedIn creds
- **Deploy:** Railway (backend) + Vercel (frontend)

## File Map
| Path | Purpose |
|---|---|
| `backend/main.py` | FastAPI app, CORS setup, router registration |
| `backend/services/scraper.py` | Orchestrates all scrapers, normalizes `posted_at`, sorts results |
| `backend/services/prep_service.py` | DDG research + Claude synthesis for interview prep packs |
| `backend/services/signals_service.py` | Company intelligence: GitHub, funding, exec hires, ATS job scan |
| `backend/services/claude_service.py` | Resume tailoring, ATS PDF generation, outreach drafting |
| `backend/services/linkedin_auth_scraper.py` | Playwright login, stealth patches, Fernet cred encryption |
| `backend/services/jobboards_scraper.py` | DDG discovers ATS URLs → Greenhouse/Lever APIs for real dates |
| `backend/routers/prep.py` | `POST /prep/generate` — interview prep pack |
| `backend/routers/signals.py` | `POST /signals/company`, `POST /signals/scan` |
| `backend/routers/alerts.py` | Alert CRUD + `POST /alerts/{id}/check` |
| `backend/routers/network.py` | `POST /network/hiring-manager`, `POST /network/alumni` |
| `backend/routers/jobs.py` | Job listing, scrape trigger (sync + background), status updates |
| `frontend/app/jobs/page.tsx` | Jobs UI: scrape modal, "Tailor" opens Resume tab in DraftPanel |
| `frontend/components/DraftPanel.tsx` | Side panel: info, outreach drafts, resume analysis + PDF generation |
| `frontend/app/signals/page.tsx` | Company/role signal scanner with type filters |
| `frontend/app/prep/page.tsx` | Interview prep pack UI with collapsible sections |
| `frontend/app/network/page.tsx` | Hiring manager + alumni finder |
| `frontend/app/alerts/page.tsx` | Saved alert CRUD with "Check Now" scrape trigger |

## Environment Variables
```
# Required
ANTHROPIC_API_KEY=           # Claude API
JWT_SECRET_KEY=              # 32+ char random secret
DATABASE_URL=                # sqlite:///./job_finder.db  OR  postgresql://...
CREDENTIAL_ENCRYPTION_KEY=   # Fernet key for LinkedIn password storage

# Optional
HUNTER_IO_API_KEY=           # Email finding
CORS_ORIGINS=https://your-frontend.vercel.app
```

## CLI / Entry Points
```bash
# Backend (dev)
uvicorn backend.main:app --reload --port 8000

# Frontend (dev)
cd frontend && npm run dev          # http://localhost:3000

# Test prep endpoint
curl -s -X POST http://localhost:8001/prep/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"company": "Stripe", "role": "Software Engineer"}'
```

## Key Design Decisions
- **DDG-first discovery:** All scrapers use DuckDuckGo to find URLs; ATS APIs enrich with real dates
- **Prep service:** Uses 2000 max_tokens with compact single-line JSON format to avoid truncation; `import json/re` at module level (not inside function)
- **Signals scan:** Uses ATS site: queries (greenhouse.io, lever.co, ashbyhq.com, wellfound.com/company) for reliable company name extraction from URL slugs
- **Resume generation prompt:** "REWRITE every bullet from scratch — do NOT copy any sentence from original"; uses facts from original as source only
- **`initialTab` prop on DraftPanel:** "Tailor" button in JobCard opens panel directly to Resume tab; "Ask AI" opens Info tab
- **Registration closed:** `POST /auth/register` returns 403; users added via admin panel only
- **LinkedIn auth safety:** Session cookies cached 20h, stealth navigator patches, Fernet-encrypted creds

## Deploy
- **Backend:** Railway auto-deploys on push to `main`
- **Frontend:** Vercel auto-deploys; set `NEXT_PUBLIC_API_URL` to Railway backend URL

## Last Updated
2026-03-17
