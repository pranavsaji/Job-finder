# Job Info Finder — Claude Context

## Purpose
Full-stack job hunting platform: scrapes jobs across 9+ platforms, enriches with ATS APIs, and uses Claude AI for outreach drafting, resume tailoring, interview prep, mock interviews, application pipeline CRM, and salary intelligence.

## Stack
- **Backend:** Python 3, FastAPI, SQLAlchemy (SQLite dev / PostgreSQL prod via `DATABASE_URL`)
- **Frontend:** Next.js 15, React 18, TypeScript, Tailwind CSS, Framer Motion
- **AI:** Anthropic Claude (sonnet-4-6 for main tasks, haiku-4-5 for fast scoring/salary)
- **Scraping:** DuckDuckGo (`ddgs`), Playwright (LinkedIn auth), httpx + BeautifulSoup
- **Scheduler:** APScheduler `AsyncIOScheduler` — hourly alerts + daily follow-up reminders
- **Code Execution:** Piston API (`emkc.org/api/v2/piston`) for mock interview coding rounds
- **Auth:** JWT (python-jose), bcrypt, Fernet encryption for LinkedIn creds
- **Deploy:** Railway (backend) + Vercel (frontend)

## File Map
| Path | Purpose |
|---|---|
| `backend/main.py` | FastAPI app, CORS, all router registration, `_migrate_db()`, `_seed_admin()` |
| `backend/services/match_service.py` | Claude Haiku job↔resume match scoring (0-100) |
| `backend/services/code_runner.py` | Piston API async code execution, 7 languages, 5s timeout |
| `backend/services/mock_interview_service.py` | Research agent, 9 interview types × 4 difficulties, evaluation engine |
| `backend/services/alert_scheduler.py` | Hourly alert cron + daily 08:00 follow-up reminder emails |
| `backend/services/claude_service.py` | Resume tailor, ATS DOCX, outreach drafts, cover letter (3 tones), LinkedIn optimizer |
| `backend/models/pipeline.py` | `PipelineEntry` — CRM stages, history, contacts JSON, offer fields |
| `backend/models/resume_version.py` | `ResumeVersion` — resume snapshots on every upload |
| `backend/models/contact.py` | `Contact` — referral tracker (discovered/messaged/replied/referred/pass) |
| `backend/models/mock_session.py` | `MockSession` — messages, evaluation, cheat_flags, research_context |
| `backend/routers/pipeline.py` | `/pipeline` CRUD, stage transitions with history, contacts add/remove |
| `backend/routers/dashboard.py` | `GET /dashboard/summary` — jobs, follow-ups, pipeline counts, mock avg, top matches |
| `backend/routers/salary.py` | `GET /salary/intelligence` (from scraped jobs) + `POST /salary/research` (DDG+Claude) |
| `backend/routers/reminders.py` | `GET /reminders/due`, `PUT /reminders/{job_id}` (set follow_up_at) |
| `backend/routers/contacts.py` | `/contacts` CRUD + `POST /contacts/from-network` bulk import |
| `backend/routers/mock_interview.py` | `/mock/start`, `/mock/chat` (SSE), `/mock/evaluate`, `/mock/execute`, `/mock/analytics` |
| `backend/routers/resume.py` | Upload + tailor + ATS DOCX + `/resume/versions` + `/resume/linkedin-optimize` |
| `backend/routers/drafts.py` | Outreach drafts + `POST /drafts/cover-letter` |
| `frontend/app/pipeline/page.tsx` | Kanban CRM: 7 stages, slide-in detail panel, stage history, contacts |
| `frontend/app/salary/page.tsx` | Salary research form + intelligence table from scraped job data |
| `frontend/app/contacts/page.tsx` | Referral tracker: status tabs, search, inline edit |
| `frontend/app/mock/page.tsx` | Mock interview: voice/video/code, Run▶ code execution, History+Analytics overlay |
| `frontend/app/resume/page.tsx` | 4-tab resume: ATS Audit / Versions / LinkedIn Optimizer / Cover Letter |
| `frontend/app/page.tsx` | Dashboard: 6 stat cards, pipeline bar, top matches, follow-ups alert, quick actions |
| `frontend/components/DraftPanel.tsx` | Side panel: info, outreach drafts, resume analysis + PDF generation |

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
- **Job match scoring:** Claude Haiku scores resume↔job 0-100; stored as `jobs.match_score`; auto-scored after scrape; displayed as green/amber/red badge
- **Pipeline CRM:** `PipelineEntry` stores stage history as JSON array `[{stage, ts, note}]`; contacts stored as JSON array; offer fields shown only when stage="offer"
- **Resume versions:** every upload auto-saves to `ResumeVersion`; restore sets `user.resume_text`; `create_tables()` must import model
- **Cover letter tones:** professional / conversational / bold — maps to Claude instruction modifier
- **Follow-up reminders:** `jobs.follow_up_at` datetime; scheduler checks daily at 08:00; also surfaces in `/dashboard/summary` as `followups_due`
- **Code execution:** Piston API (no auth needed); 5s run timeout; stdout/stderr capped at 2000/1000 chars; shown below Monaco editor
- **Mock analytics:** `GET /mock/analytics` aggregates completed sessions; returns `trends`, `avg_by_type`, `pass_rate`; rendered as SVG line chart + bar chart
- **Salary parsing:** regex extracts min/max from raw strings (handles "120k-180k", "$120,000"); formatted as "$120K" in UI
- **Job user isolation:** all queries scoped to `current_user.id`; dedup per-user (post_url + user_id)
- **Mock interview:** research_context stored in session; chat capped 30 messages; evaluate idempotent; `[INTERVIEW_COMPLETE]` auto-triggers eval
- **Registration closed:** `POST /auth/register` returns 403; users added via admin panel only
- **SSE streaming:** newlines escaped `\\n` backend → unescaped frontend; `[DONE:True/False]` signals completion

## Deploy
- **Backend:** Railway auto-deploys on push to `main`
- **Frontend:** Vercel auto-deploys; set `NEXT_PUBLIC_API_URL` to Railway backend URL

## Bug Fixes Applied
- `GET /jobs 500`: Added missing DB migrations for `jobs.matched_role`, `jobs.salary_range`, `users.scraping_preferences`, `users.resume_filename`, `users.hunter_api_key`, `users.target_roles`
- `pipeline/page.tsx`: Fixed `res.data.entries` (was `res.data`) — crash on `.filter()` since API returns `{entries: [...]}`
- `pipeline/page.tsx`: Fixed stage history key `h.ts` (was `h.timestamp`) — "Invalid Date" in UI
- `pipeline.py stats`: Fixed `db.func.count` → `func.count` (from sqlalchemy import)

## Resume Critic (Enhanced)
- **Recruiter persona**: Jordan Mills, 15yr field recruiter, 80k+ resumes, 1000+/week
- **New critique fields**: `experience_verdict` (level match, credibility), `narrative_analysis` (trajectory, career story score), `market_benchmarks` (vs peers, interview probability, differentiator/liability), `rebuild_directives` (summary instruction, bullet formula, skills restructure, critical_additions/removals)
- **Build from critique**: Now uses rebuild_directives + market context for higher-quality rebuild
- **Frontend**: New UI sections for experience verdict, career narrative, market position, rebuild blueprint

## Last Updated
2026-03-18
