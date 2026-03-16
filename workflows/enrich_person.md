# Workflow: Enrich Person Info

## Objective
Fetch and enrich information about a job poster for use in personalized outreach.

## Required Inputs
- `job_id`: The job ID whose poster you want to enrich
- OR `linkedin_url`: Direct LinkedIn profile URL
- OR `name` + `company`: Person's name and company

## Tools Used
- Backend API: `GET /person/{job_id}`
- Backend API: `POST /person/enrich`

## Steps

### Step 1: Try automatic enrichment from job data
When a job is scraped, basic poster info is captured:
- `poster_name` - from the post
- `poster_title` - from the post
- `poster_profile_url` - link to their profile
- `poster_linkedin` - LinkedIn URL if available

### Step 2: Trigger enrichment via API
```
GET /person/{job_id}
```
This will:
1. Check if person data is already cached
2. If not, call `person_enricher.py` to fetch additional info
3. Try LinkedIn public profile scrape
4. Extract bio, location, skills from available data
5. Cache in the `persons` table

### Step 3: Manual enrichment
If automatic enrichment fails or you have a direct URL:
```
POST /person/enrich
{
  "linkedin_url": "https://linkedin.com/in/johndoe",
  "job_id": 123
}
```

## What Gets Enriched

| Field | Source |
|---|---|
| `name` | Job post, LinkedIn profile |
| `title` | Job post, LinkedIn headline |
| `company` | Job post, LinkedIn |
| `bio` | LinkedIn profile summary |
| `location` | LinkedIn, job post |
| `skills` | Extracted from post content keywords |
| `recent_posts` | The job posting itself |
| `profile_image_url` | LinkedIn (when accessible) |

## Limitations

LinkedIn publicly accessible data is limited due to authentication requirements:
- Profile photos may not be available
- Work history and full bio require login
- We use Google search snippets and public profile data as a fallback

For richer data, consider:
- Manually visiting the profile and noting key context
- Using the "custom_notes" field in draft generation to add personal context

## Edge Cases

### Person already enriched
If `GET /person/{job_id}` returns existing data, it uses the cache. To force re-enrichment, use `POST /person/enrich` with the `job_id`.

### LinkedIn URL not available
If the poster did not include their LinkedIn URL, enrichment will use only the data from the post itself. The name and title from the original post are still used for drafting.

### Anonymous posters
Some platforms (especially Reddit, HN) have anonymous or pseudonymous posters. In this case:
- Use the username as the "name"
- Skip LinkedIn enrichment
- Focus drafts on the job content rather than personal connection

## Output
```json
{
  "id": 1,
  "name": "Jane Smith",
  "title": "Head of Engineering",
  "company": "Acme Corp",
  "linkedin_url": "https://linkedin.com/in/janesmith",
  "twitter_handle": null,
  "bio": "Building great engineering teams...",
  "location": "San Francisco, CA",
  "skills": ["python", "machine learning", "aws"],
  "recent_posts": [
    {
      "content": "We are hiring a senior engineer...",
      "platform": "linkedin",
      "url": "https://linkedin.com/posts/...",
      "posted_at": "2026-03-10T14:00:00Z"
    }
  ],
  "enriched_at": "2026-03-15T09:00:00Z"
}
```
