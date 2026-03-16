# Workflow: Find Email Address

## Objective
Find the email address of a job poster using Hunter.io API and pattern matching fallback.

## Required Inputs
- `name`: Full name of the person
- `company` or `domain`: Company name or known domain

## Tools Used
- `tools/find_email.py` - Standalone CLI tool
- Backend API: `POST /email/find`

## Steps

### Step 1: Determine the domain
If you have the company name but not the domain:
1. Hunter.io domain search will try to find it automatically
2. Fallback: pattern matching strips legal suffixes (Inc, LLC, Corp) and appends .com

### Step 2: Run email lookup
```bash
python tools/find_email.py --name "John Doe" --company "Acme Corp"
# or with known domain
python tools/find_email.py --name "John Doe" --domain "acme.io"
# or with Hunter.io API key
python tools/find_email.py --name "John Doe" --domain "acme.com" --hunter-key YOUR_KEY
```

Via API:
```
POST /email/find
{
  "name": "John Doe",
  "company": "Acme Corp",
  "domain": "acme.com"
}
```

### Step 3: Evaluate results
Results include confidence scores:
- High (80+): Hunter.io verified match - use this first
- Medium (60-79): Common pattern match - reasonable to try
- Low (below 60): Best guess only

### Step 4: Verify before sending
For important outreach, verify the email:
```
GET /email/verify/john@acme.com
```
This checks MX record existence (does not send an email).

## Email Pattern Priority
In order of likelihood:
1. `first.last@domain` (most common)
2. `flast@domain` (initial + last)
3. `first@domain` (first name only)
4. `firstl@domain` (first + initial)
5. `first_last@domain`
6. `last.first@domain`

## Edge Cases

### Hunter.io not configured
Without an API key, only pattern matching is used. Confidence scores will be lower.

### Common domain confusion
Some companies use different domains for email vs web:
- e.g., Apple employees use apple.com not apple.co
- LinkedIn URL slugs do not always match domain names
- Try common variations if first attempt fails

### Generic company names
Very common names (e.g., "Tech Corp") may return incorrect domains. Always verify the domain manually before using pattern-matched emails.

## Output
```json
{
  "name": "John Doe",
  "domain": "acme.com",
  "emails": [
    {
      "email": "john.doe@acme.com",
      "confidence": 85,
      "source": "hunter.io",
      "verified": true
    },
    {
      "email": "jdoe@acme.com",
      "confidence": 70,
      "source": "pattern",
      "verified": false
    }
  ],
  "best_guess": "john.doe@acme.com"
}
```
