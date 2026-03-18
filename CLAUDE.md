# Job Info Finder — Claude Context

## Purpose
Full-stack job hunting platform: scrapes job postings across 9+ platforms, enriches with real dates via ATS APIs, and uses Claude AI to draft outreach, tailor resumes, generate interview prep packs, and run mock interviews.

## Stack
- **Backend:** Python 3, FastAPI, SQLAlchemy (SQLite dev / PostgreSQL prod via `DATABASE_URL`)
- **Frontend:** Next.js 15, React 18, TypeScript, Tailwind CSS, Framer Motion
- **AI:** Anthropic Claude (`claude_service.py`, `prep_service.py`, `mock_interview_service.py`)
- **Scraping:** DuckDuckGo (`ddgs`), Playwright (LinkedIn auth), httpx + BeautifulSoup
- **Scheduler:** APScheduler `AsyncIOScheduler` — hourly alert cron, SMTP email via smtplib
- **Mock Interview:** Monaco Editor (`@monaco-editor/react`, dynamic import `ssr:false`), Web Speech API STT/TTS, `getUserMedia` webcam
- **ATS APIs:** Greenhouse, Lever for real posting dates
- **Auth:** JWT (python-jose), bcrypt, Fernet encryption for LinkedIn creds
- **Deploy:** Railway (backend) + Vercel (frontend)

## File Map
| Path | Purpose |
|---|---|
| `backend/main.py` | FastAPI app, CORS, router registration, `_migrate_db()`, `_seed_admin()` |
| `backend/services/scraper.py` | Orchestrates all scrapers, normalizes `posted_at` |
| `backend/services/prep_service.py` | DDG research + Claude synthesis for interview prep packs |
| `backend/services/signals_service.py` | GitHub, funding, exec hires, ATS job scan |
| `backend/services/claude_service.py` | Resume tailoring, ATS PDF generation, outreach drafting |
| `backend/services/mock_interview_service.py` | Research agent, system prompt builder (9 types × 4 difficulties), evaluation engine |
| `backend/services/alert_scheduler.py` | Hourly APScheduler: scrape alerts, save new jobs, send email |
| `backend/models/mock_session.py` | `MockSession` — messages, evaluation, cheat_flags, speech_metrics, research_context |
| `backend/models/prep_pack.py` | `PrepPackRecord` — saved interview prep packs (upsert by user+company+role) |
| `backend/routers/mock_interview.py` | `/mock/start`, `/mock/chat` (SSE), `/mock/evaluate`, `/mock/sessions` CRUD |
| `backend/routers/prep.py` | `/prep/generate`, `/prep/chat` (SSE), `/prep/save`, `/prep/saved`, `/prep/saved/{id}` |
| `backend/routers/alerts.py` | Alert CRUD + `POST /alerts/{id}/check` |
| `backend/routers/network.py` | `POST /network/hiring-manager`, `POST /network/alumni` |
| `backend/routers/jobs.py` | Job listing, scrape trigger, status updates — all queries scoped to `current_user.id` |
| `frontend/app/mock/page.tsx` | Full mock interview UI: setup, voice/video session, Monaco code editor, eval report |
| `frontend/app/prep/page.tsx` | Prep pack UI: collapsible sections, voice interview agent, save/load saved packs |
| `frontend/components/DraftPanel.tsx` | Side panel: info, outreach drafts, resume analysis + PDF generation |

## Environment Variables
```
ANTHROPIC_API_KEY=           # Required: Claude API
JWT_SECRET_KEY=              # Required: 32+ char random secret
DATABASE_URL=                # Required: sqlite:///./job_finder.db OR postgresql://...
CREDENTIAL_ENCRYPTION_KEY=   # Required: Fernet key for LinkedIn cred storage
HUNTER_IO_API_KEY=           # Optional: email finding
CORS_ORIGINS=                # Optional: https://your-frontend.vercel.app
SMTP_HOST=smtp.gmail.com     # All 4 SMTP vars required together to enable email
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=app-password
EMAIL_FROM=you@gmail.com
APP_URL=https://your-frontend.vercel.app
```

## CLI / Entry Points
```bash
uvicorn backend.main:app --reload --port 8000   # backend dev
cd frontend && npm run dev                       # frontend dev (http://localhost:3000)
```

## Key Design Decisions
- **DDG-first discovery:** All scrapers use DuckDuckGo to find URLs; ATS APIs enrich with real dates
- **Job user isolation:** `jobs.user_id` (nullable for legacy rows); all queries scoped to `current_user.id`; dedup is per-user (post_url + user_id)
- **Auto-cleanup:** `_auto_clean()` deletes `status="new"` jobs older than 7 days before every scrape (manual + cron)
- **Registration closed:** `POST /auth/register` returns 403; users added via admin panel only
- **Prep packs:** `PrepPackRecord` upserts on same user+company+role; `create_tables()` must import model to register with metadata
- **Mock interview lifecycle:** setup → research (DDG + Claude) → active (SSE chat) → evaluate (Claude rubric) → report; `[INTERVIEW_COMPLETE]` token auto-triggers evaluation
- **Mock interview types:** behavioral, technical_screen, system_design, coding, manager, deep_dive, salary, stress, culture_fit — 9 types × 4 difficulties (easy/medium/hard/impossible)
- **research_context stored in MockSession:** passed from `/start` to DB; loaded in `_chat_generator` via `sess.research_context`; chat caps at 30 messages for API efficiency
- **Anti-cheat:** `visibilitychange` + `paste` event listeners; tab-switch and paste counts sent with evaluate; Claude penalises scores if flagged
- **voiceRef/stageRef/streamingRef pattern:** useRef synced via useEffect for closure-safe async STT/TTS callbacks; `startListening()` guards check `streamingRef.current` and `stageRef.current`
- **Evaluation:** Claude scores 5 dimensions (0–100); verdict = pass ≥70 / conditional_pass 55–69 / fail <55; idempotent (cached if already completed)
- **Alert scheduler:** `AsyncIOScheduler` first run 30s after boot, then every 1h; email skipped if SMTP vars absent
- **SSE streaming:** newlines escaped as `\\n` in backend, unescaped in frontend; `[DONE:True/False]` signals completion

## Deploy
- **Backend:** Railway auto-deploys on push to `main`
- **Frontend:** Vercel auto-deploys; set `NEXT_PUBLIC_API_URL` to Railway backend URL

## Last Updated
2026-03-18
