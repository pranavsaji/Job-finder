# Job Info Finder — Claude Context

## Purpose
Full-stack job hunting platform: scrapes job postings/hiring posts across 9+ platforms, enriches with real dates via ATS APIs, and uses Claude AI to draft outreach, tailor resumes, and generate interview prep packs.

## Stack
- **Backend:** Python 3, FastAPI, SQLAlchemy (SQLite dev / PostgreSQL prod via `DATABASE_URL`)
- **Frontend:** Next.js 15, React 18, TypeScript, Tailwind CSS, Framer Motion
- **AI:** Anthropic Claude (`claude_service.py`, `prep_service.py`)
- **Scraping:** DuckDuckGo (`ddgs`), Playwright (LinkedIn auth), httpx + BeautifulSoup
- **Scheduler:** APScheduler `AsyncIOScheduler` — hourly alert cron, SMTP email via smtplib
- **Mock Interview:** Monaco Editor (`@monaco-editor/react`, dynamic import), Web Speech API STT/TTS, `getUserMedia` webcam
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
| `backend/models/prep_pack.py` | `PrepPackRecord` SQLAlchemy model — stores saved interview prep packs |
| `backend/routers/prep.py` | `/prep/generate`, `/prep/chat` (SSE), `/prep/save`, `/prep/saved`, `/prep/saved/{id}` |
| `backend/routers/signals.py` | `POST /signals/company`, `POST /signals/scan` |
| `backend/services/alert_scheduler.py` | Hourly APScheduler job: scrape all user alerts, save new jobs, send email |
| `backend/models/mock_session.py` | `MockSession` model — stores interview sessions, messages, evaluation, cheat flags |
| `backend/services/mock_interview_service.py` | Research agent, system prompt builder (9 types × 4 difficulties), evaluation engine |
| `backend/routers/mock_interview.py` | `/mock/start`, `/mock/chat` (SSE), `/mock/evaluate`, `/mock/sessions` CRUD |
| `frontend/app/mock/page.tsx` | Full mock interview UI: setup, voice/video session, Monaco code editor, eval report |
| `backend/routers/alerts.py` | Alert CRUD + `POST /alerts/{id}/check` |
| `backend/routers/network.py` | `POST /network/hiring-manager`, `POST /network/alumni` |
| `backend/routers/jobs.py` | Job listing, scrape trigger (sync + background), status updates |
| `frontend/app/jobs/page.tsx` | Jobs UI: scrape modal, "Tailor" opens Resume tab in DraftPanel |
| `frontend/components/DraftPanel.tsx` | Side panel: info, outreach drafts, resume analysis + PDF generation |
| `frontend/app/signals/page.tsx` | Company/role signal scanner with type filters |
| `frontend/app/prep/page.tsx` | Prep pack UI: collapsible sections, voice interview agent, save/load saved packs |
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

# Alert email (all required together to enable; skip to disable email)
SMTP_HOST=smtp.gmail.com     # e.g. smtp.gmail.com
SMTP_PORT=587                # STARTTLS port
SMTP_USER=you@gmail.com      # sender login
SMTP_PASS=app-password       # Gmail app password or SMTP password
EMAIL_FROM=you@gmail.com     # display From address (defaults to SMTP_USER)
APP_URL=https://your-frontend.vercel.app  # used in email job links
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
- **Job user isolation:** `jobs.user_id` column (nullable for legacy rows); all queries scoped to `current_user.id`; dedup is per-user (same URL can exist for different users)
- **Auto-cleanup:** `_auto_clean()` deletes `status="new"` jobs older than 7 days for the current user before every scrape; saved/applied/archived jobs are never touched
- **`initialTab` prop on DraftPanel:** "Tailor" button in JobCard opens panel directly to Resume tab; "Ask AI" opens Info tab
- **Registration closed:** `POST /auth/register` returns 403; users added via admin panel only
- **LinkedIn auth safety:** Session cookies cached 20h, stealth navigator patches, Fernet-encrypted creds
- **Prep packs persistence:** `PrepPackRecord` table upserts on same user+company+role; `create_tables()` must import the model to register it with SQLAlchemy metadata
- **Interview agent:** SSE streaming via `StreamingResponse`; newlines escaped as `\\n` in backend, unescaped in frontend; optional DDG search injected for fresh-info keywords
- **Alert scheduler:** `AsyncIOScheduler` started at app startup (first run 30 s after boot, then every 1 h); each alert scrapes its roles, saves new jobs per user, emails if new jobs found; email skipped gracefully when SMTP vars absent
- **Mock interview session lifecycle:** setup → research (DDG + Claude) → active (SSE chat) → evaluate (Claude rubric) → report; `[INTERVIEW_COMPLETE]` token in stream auto-triggers evaluation
- **Mock interview types:** behavioral, technical_screen, system_design, coding, manager, deep_dive, salary, stress, culture_fit — each has its own persona, question count, and focus
- **Anti-cheat:** `visibilitychange` + `paste` event listeners in coding round; tab-switch and paste counts sent with evaluate request; Claude penalises scores if flagged
- **Speech metrics:** filler word count, Web Speech API confidence scores, WPM — all fed into confidence score during evaluation
- **Evaluation:** Claude scores 5 dimensions (0-100, no grade inflation); verdict = pass ≥70 / conditional_pass 55-69 / fail <55; impossible difficulty expects most candidates to fail

## Deploy
- **Backend:** Railway auto-deploys on push to `main`
- **Frontend:** Vercel auto-deploys; set `NEXT_PUBLIC_API_URL` to Railway backend URL

## Last Updated
2026-03-18
