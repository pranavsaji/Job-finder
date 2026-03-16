# Workflow: Scrape Jobs

## Objective
Scrape job postings from LinkedIn, Twitter/X, Reddit, and Hacker News for specified roles and save them to the database.

## Required Inputs
- `roles`: List of target job roles (e.g., "software engineer", "product manager")
- `platforms`: Which platforms to scrape (default: all)
- `days`: How many days back to look (default: 7)

## Tools Used
- `tools/scrape_linkedin.py` - LinkedIn scraper via Google search
- `tools/scrape_twitter.py` - Twitter/X scraper via Nitter
- `tools/scrape_reddit.py` - Reddit scraper via JSON API
- `tools/scrape_hn.py` - Hacker News scraper via Algolia API
- Backend API endpoint: `POST /jobs/scrape/sync`

## Steps

### 1. Pre-scrape check
Before scraping, confirm:
- Roles are specific enough (avoid very broad terms like just "engineer")
- Date range is reasonable (more than 30 days back yields diminishing returns)
- Not hitting rate limits from recent scrapes (wait 60 seconds between runs)

### 2. Run scraper for each platform

**LinkedIn:**
```bash
python tools/scrape_linkedin.py --roles "software engineer,frontend developer" --days 7
```
Note: LinkedIn is scraped via Google site: search. Results may be limited due to Google rate limiting. Use exponential backoff if 429 errors occur.

**Twitter/X:**
```bash
python tools/scrape_twitter.py --roles "software engineer" --days 3
```
Note: Uses public Nitter instances. Try alternate instances if one fails.

**Reddit:**
```bash
python tools/scrape_reddit.py --roles "software engineer" --days 7 --subreddits "forhire,hiring,remotework"
```
Note: Reddit JSON API is public but rate-limited. Respect 1 second between requests.

**Hacker News:**
```bash
python tools/scrape_hn.py --month "March 2026"
```
Note: "Who is Hiring" thread is typically posted the first weekday of each month.

### 3. Save results to database
Via API:
```
POST /jobs/scrape/sync
{
  "roles": ["software engineer"],
  "platforms": ["linkedin", "reddit", "hn"],
  "date_from": "2026-03-01T00:00:00Z",
  "enrich_with_claude": true
}
```

### 4. Verify results
After scraping:
```
GET /jobs?page=1&per_page=20
```
Confirm new jobs appeared with correct platform, title, and content.

## Edge Cases

### Rate limiting
- Google: Back off 10-30 seconds, rotate user agents
- Reddit: Wait 2-5 seconds between requests, check for 429 status
- Nitter: Try next instance in the list if first fails
- HN Algolia: Generally permissive, but wait 0.5 seconds between calls

### Empty results
If a platform returns 0 results:
1. Try broadening the role query (e.g., "engineer" instead of "senior software engineer")
2. Check if the platform is accessible (run a manual test request)
3. Extend the date range (use --days 30)

### Duplicate posts
The scraper deduplicates by `post_url`. If the same post appears across multiple roles, only one copy is saved.

## Output
- Jobs saved to SQLite database
- Status set to "new" for all scraped jobs
- Accessible via `GET /jobs` with filters

## Cadence
Recommended scraping schedule:
- LinkedIn/Reddit: Daily or every 2 days
- Twitter: Every 6-12 hours for fast-moving opportunities
- HN: Once at the start of each month (for "Who is Hiring" thread)
