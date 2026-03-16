# Workflow: Draft Outreach Messages

## Objective
Generate personalized LinkedIn DMs, emails, and talking points for job opportunities using Claude claude-sonnet-4-6.

## Required Inputs
- `job_id`: ID of the target job in the database
- `user_resume`: Uploaded resume (for context)
- `draft_type`: One of "linkedin", "email", "talking_points"
- `recipient_email`: Required for email drafts

## Tools Used
- `tools/draft_message.py` - Standalone CLI drafting tool
- Backend API endpoints:
  - `POST /drafts/linkedin`
  - `POST /drafts/email`
  - `POST /drafts/talking-points`

## Pre-conditions

1. The job must exist in the database
2. The user must have uploaded their resume for best results
3. ANTHROPIC_API_KEY must be set in .env

## Steps

### Step 1: Fetch person info
Before drafting, enrich the poster's profile:
```
GET /person/{job_id}
```
This triggers enrichment and returns name, title, bio, and skills.

### Step 2: Find email (for email drafts)
```
POST /email/find
{
  "name": "John Doe",
  "company": "Acme Corp"
}
```
Use the highest-confidence email from the result.

### Step 3: Generate the draft

**LinkedIn DM:**
```
POST /drafts/linkedin
{
  "job_id": 123,
  "custom_notes": "I saw their recent blog post about X"
}
```

**Email:**
```
POST /drafts/email
{
  "job_id": 123,
  "email": "john@acme.com"
}
```

**Talking Points:**
```
POST /drafts/talking-points
{
  "job_id": 123
}
```

### Step 4: Review and edit
- All drafts are stored in the database and editable via the UI
- Copy the message using the copy button
- Edit in the textarea before sending

## Quality Guidelines

### LinkedIn DMs
- Under 250 words
- Open with something specific about the person or company
- Mention 1-2 relevant skills from resume
- End with a low-pressure CTA
- No em dashes or en dashes (strictly enforced by Claude system prompt)

### Emails
- Subject line: specific, not generic (mention role + company name)
- 3-4 short paragraphs
- Professional but personable
- Clear CTA in the closing paragraph

### Talking Points
- 3-5 specific, actionable points
- Grounded in both resume and job description
- Quantify achievements where possible

## Edge Cases

### No resume uploaded
Claude will generate a more generic draft. Prompt the user to upload their resume for better results.

### Poster info unavailable
If person enrichment fails, Claude uses what is available from the job post itself (poster name, title, company).

### API failures
If Claude returns an error:
1. Check ANTHROPIC_API_KEY is valid
2. Verify the request does not exceed Claude's context window
3. Truncate resume text to 800 characters and retry

## Output Format

LinkedIn Draft:
```json
{
  "id": 1,
  "job_id": 123,
  "draft_type": "linkedin",
  "content": "...",
  "created_at": "2026-03-15T10:00:00Z"
}
```

Email Draft:
```json
{
  "id": 2,
  "job_id": 123,
  "draft_type": "email",
  "subject_line": "Re: Senior Engineer role at Acme",
  "content": "...",
  "created_at": "2026-03-15T10:01:00Z"
}
```
