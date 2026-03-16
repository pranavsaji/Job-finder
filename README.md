# Job Info Finder

An advanced job hunting intelligence platform that scrapes job postings from LinkedIn, Twitter/X, Reddit, and Hacker News, then drafts personalized outreach messages using Claude claude-sonnet-4-6.

## Features

- Scrapes LinkedIn, Twitter/X, Reddit, and Hacker News for hiring posts
- Role-based targeting with date filtering
- Resume upload and parsing (PDF, DOCX)
- Fetches info about job posters
- Drafts personalized LinkedIn DMs using Claude
- Email finder agent (Hunter.io + pattern matching)
- Personalized email draft generation
- JWT authentication
- Modern dark-themed UI with glassmorphism effects

## Quick Start

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Copy and fill in env vars
cp .env.example .env

# Run the API
uvicorn backend.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp ../.env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8000

npm run dev
```

Open http://localhost:3000

## Environment Variables

Copy `.env.example` to `.env` (backend) and `.env.local` (frontend) and fill in:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `HUNTER_IO_API_KEY` | Hunter.io key for email finding (optional) |
| `JWT_SECRET_KEY` | Random secret for JWT signing |
| `DATABASE_URL` | SQLite path (default: sqlite:///./job_finder.db) |
| `CORS_ORIGINS` | Frontend URL (default: http://localhost:3000) |
| `NEXT_PUBLIC_API_URL` | Backend URL (default: http://localhost:8000) |

## API Documentation

Once running, visit http://localhost:8000/docs for interactive API docs.

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: FastAPI, SQLAlchemy, SQLite
- **AI**: Anthropic Claude claude-sonnet-4-6
- **Scraping**: httpx, BeautifulSoup
- **Auth**: JWT with python-jose

## WAT Framework

This project follows the WAT (Workflows, Agents, Tools) architecture:
- `workflows/` - Markdown SOPs for each major task
- `tools/` - Standalone Python scripts for CLI usage
- `backend/` - FastAPI application with services layer

## Tools (CLI)

```bash
# Scrape LinkedIn
python tools/scrape_linkedin.py --roles "software engineer" --days 7

# Scrape Reddit
python tools/scrape_reddit.py --roles "software engineer" --days 3

# Scrape Hacker News
python tools/scrape_hn.py --month "March 2026"

# Find email
python tools/find_email.py --name "John Doe" --company "Acme Corp"

# Parse resume
python tools/parse_resume.py --file resume.pdf

# Draft message
python tools/draft_message.py --job-id 1 --type linkedin --name "Your Name"
```
