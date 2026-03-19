# Job Info Finder — Claude Context

## Purpose
Full-stack job hunting platform: scrapes jobs across 9+ platforms, enriches with ATS APIs, and uses Claude AI for outreach drafting, resume tailoring, mock interviews, pipeline CRM, and salary intelligence.

## Stack
- **Backend:** Python 3, FastAPI, SQLAlchemy (SQLite dev / PostgreSQL prod via `DATABASE_URL`)
- **Frontend:** Next.js 15, React 18, TypeScript, Tailwind CSS, Framer Motion
- **AI:** Anthropic Claude (sonnet-4-6 main, haiku-4-5 scoring/salary)
- **Scraping:** DuckDuckGo (`ddgs` with `region="us-en"` + English/junk filters), Playwright (LinkedIn auth), httpx
- **Scheduler:** APScheduler `AsyncIOScheduler` — 30-min alert tick + daily 08:00 follow-up reminders
- **Code Execution:** Wandbox API (free, no auth) for mock interview coding rounds
- **Auth:** JWT (python-jose), bcrypt, Fernet encryption for LinkedIn creds
- **Deploy:** Railway (backend) + Vercel (frontend)

## File Map
| Path | Purpose |
|---|---|
| `backend/main.py` | FastAPI app, CORS, router registration, `_migrate_db()`, `_seed_admin()` |
| `backend/services/scraper.py` | Platform orchestrator; 45s per-platform timeout; LLM post-filter for post platforms |
| `backend/services/wellfound_scraper.py` | DDG scraper with strict URL validation (rejects landing pages, only `/company/*/jobs/*`) |
| `backend/services/jobboards_scraper.py` | DDG discovery + Greenhouse/Lever API date enrichment; timezone-safe date filter |
| `backend/services/signals_service.py` | Company signals: GitHub, funding, exec hires, product launches; English-only DDG |
| `backend/services/alert_scheduler.py` | Per-alert `email_interval_hours` + `last_emailed_at`; roles×countries cross-join |
| `backend/services/claude_service.py` | Resume tailor, ATS DOCX, critique streaming (`AsyncAnthropic`), cover letter (3 tones) |
| `backend/services/match_service.py` | Claude Haiku job↔resume match scoring (0-100) |
| `backend/services/mock_interview_service.py` | Research agent, 9 types × 4 difficulties, evaluation engine |
| `backend/routers/jobs.py` | `/jobs/scrape/sync`: computes `effective_date_from` from `date_preset`; never returns 500 |
| `backend/routers/signals.py` | `/signals/company` + `/signals/scan`; accepts `country` filter |
| `backend/routers/resume.py` | `/resume/critique` SSE stream; full resume, no truncation |
| `backend/routers/alerts.py` | Alert CRUD; manual check triggers email; multi-country support |
| `backend/models/pipeline.py` | `PipelineEntry` — CRM stages, history JSON, contacts JSON, offer fields |
| `frontend/app/jobs/page.tsx` | Jobs list: 3 categories (posts/listings/funded), date pills, scrape panel |
| `frontend/app/mock/page.tsx` | Mock interview: force fullscreen + camera/mic on start; tab-switch warns not stops |
| `frontend/app/alerts/page.tsx` | Per-alert email interval (1h–24h), multi-country tags, countdown to next email |
| `frontend/app/resume/page.tsx` | 5 tabs: ATS Audit / Recruiter Critique (SSE) / Versions / LinkedIn / Cover Letter |
| `frontend/app/signals/page.tsx` | Company signals + broad role scan; country filter |
| `frontend/components/DraftPanel.tsx` | Slide-in: job info, outreach drafts, resume analysis + PDF |

## Environment Variables
```
ANTHROPIC_API_KEY=           # Required
JWT_SECRET_KEY=              # Required: 32+ char secret
DATABASE_URL=                # Required: sqlite:///./job_finder.db OR postgresql://...
CREDENTIAL_ENCRYPTION_KEY=   # Required: Fernet key for LinkedIn creds
HUNTER_IO_API_KEY=           # Optional: email finding
CORS_ORIGINS=                # Optional: https://your-frontend.vercel.app
SMTP_HOST=smtp.gmail.com     # All 4 required together; omit to disable email
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=app-password
EMAIL_FROM=you@gmail.com
APP_URL=https://your-frontend.vercel.app
```

## CLI / Entry Points
```bash
uvicorn backend.main:app --reload --port 8000   # backend dev
cd frontend && npm run dev                       # frontend (http://localhost:3000)
```

## Key Design Decisions
- **Scraping resilience:** 3 layers — endpoint catch-all, 45s per-platform timeout, DDG 2x retry. Never returns 500.
- **Date filtering:** Router computes `effective_date_from` from `date_preset` ("7d" → now-7d) so all scraper post-filters run. DDG timelimit NOT used (unreliable); post-filter by `posted_at` instead. Unknowns (no date) are kept.
- **Wellfound URL guard:** `_is_real_wellfound_job()` rejects homepage/landing pages; only accepts `/company/*/jobs/*`, `/l/jobs/*`, `/jobs/<slug>` patterns.
- **English-only scraping:** `region="us-en"` + `_NON_ENGLISH_RE` (CJK/Arabic/Cyrillic) + `_JUNK_DOMAINS` (Pinterest, Baidu, etc.) on all DDG scrapers.
- **Signals country filter:** `country` param threads through router → `scan_signals_for_roles` → DDG queries.
- **Per-alert scheduling:** Each alert stores `email_interval_hours` + `last_emailed_at`; scheduler ticks every 30min; roles × countries cross-join for search queries.
- **Resume critique SSE:** `StreamingResponse` + `AsyncAnthropic.messages.stream()`; newlines escaped `\\n`→unescaped; JSON parsed on `[DONE]` sentinel. Full resume, no truncation.
- **Mock interview:** Camera/mic forced before API call (`requestMediaPermissions()`); auto-fullscreen on start; tab switch warns + re-enters fullscreen (does NOT stop interview).
- **Job user isolation:** All queries scoped to `current_user.id`; dedup per-user (post_url + user_id).
- **Registration closed:** `POST /auth/register` returns 403; users added via admin panel only.

## Deploy
- **Backend:** Railway auto-deploys on push to `main`
- **Frontend:** Vercel auto-deploys; set `NEXT_PUBLIC_API_URL` to Railway backend URL

## Last Updated
2026-03-19 (wellfound URL guard, date_from from preset, English-only scraping, signals country filter, mock interview fullscreen+camera)
