import anthropic
import os
import re
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MODEL = "claude-sonnet-4-6"

NO_DASH_INSTRUCTION = (
    "CRITICAL FORMATTING RULE: Never use em dashes (the long dash character) or en dashes "
    "(the medium dash character) anywhere in your response. Do not use -- or the Unicode "
    "characters for em dash or en dash. Use regular hyphens (-), commas, or periods instead "
    "when you need to create a pause or connect phrases. This rule is absolute and non-negotiable."
)


def _clean_dashes(text: str) -> str:
    """Remove any stray em/en dashes from output as a safety net."""
    text = text.replace("\u2014", "-")
    text = text.replace("\u2013", "-")
    text = re.sub(r"(?<!\-)\-\-(?!\-)", "-", text)
    return text


def _get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


async def draft_linkedin_message(
    job_info: dict,
    person_info: dict,
    resume_text: str,
    user_name: str,
) -> str:
    """Draft a personalized LinkedIn DM based on job and person context."""
    client = _get_client()

    poster_title = person_info.get("title", "").lower()
    if any(word in poster_title for word in ["cto", "vp", "director", "chief", "president", "founder"]):
        tone = "formal and respectful"
    elif any(word in poster_title for word in ["engineer", "developer", "designer", "scientist"]):
        tone = "casual-professional and peer-to-peer"
    else:
        tone = "warm and professional"

    company = job_info.get("company", "the company")
    role = job_info.get("title", "the role")
    poster_name = person_info.get("name", "there")
    poster_bio = person_info.get("bio", "")
    poster_skills = ", ".join(person_info.get("skills", [])[:5])
    recent_posts = person_info.get("recent_posts", [])
    recent_post_snippet = recent_posts[0].get("content", "") if recent_posts else ""

    system_prompt = f"""You are an expert at writing personalized LinkedIn outreach messages for job seekers.
Your messages are concise (under 300 words), genuine, and never feel generic or spammy.
You write in a {tone} tone.
{NO_DASH_INSTRUCTION}"""

    user_prompt = f"""Write a LinkedIn DM from {user_name} to {poster_name} about the following job opportunity.

JOB INFO:
- Role: {role}
- Company: {company}
- Job Post: {job_info.get('post_content', '')[:500]}
- Location: {job_info.get('location', 'Not specified')}

POSTER INFO:
- Name: {poster_name}
- Title: {person_info.get('title', 'Not specified')}
- Bio: {poster_bio[:300] if poster_bio else 'Not available'}
- Skills/Focus: {poster_skills if poster_skills else 'Not available'}
- Recent post: {recent_post_snippet[:200] if recent_post_snippet else 'Not available'}

MY RESUME HIGHLIGHTS:
{resume_text[:800] if resume_text else 'Not provided'}

INSTRUCTIONS:
- Open with a specific, genuine hook referencing something about {poster_name} or the company
- Briefly mention 1-2 relevant skills or experiences from my resume
- Express genuine interest in the role and company
- End with a clear but low-pressure call to action
- Keep it under 250 words
- Do NOT use em dashes or en dashes anywhere
- Do NOT start with "Hi [Name]," as the opener - be more creative
- Make it feel human and authentic, not like a template"""

    message = client.messages.create(
        model=MODEL,
        max_tokens=600,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    result = message.content[0].text
    return _clean_dashes(result)


async def draft_email(
    job_info: dict,
    person_info: dict,
    resume_text: str,
    user_name: str,
    email: str,
) -> dict:
    """Draft a personalized email with subject line."""
    client = _get_client()

    company = job_info.get("company", "the company")
    role = job_info.get("title", "the role")
    poster_name = person_info.get("name", "Hiring Manager")

    system_prompt = f"""You are an expert at writing personalized cold emails for job seekers.
Your emails are professional, compelling, and get responses.
You always write a strong subject line and a well-structured email body.
{NO_DASH_INSTRUCTION}"""

    user_prompt = f"""Write a cold email from {user_name} to {poster_name} (email: {email}) about the {role} position at {company}.

JOB INFO:
- Role: {role}
- Company: {company}
- Post content: {job_info.get('post_content', '')[:500]}

POSTER INFO:
- Name: {poster_name}
- Title: {person_info.get('title', 'Not specified')}
- Company: {company}

MY RESUME HIGHLIGHTS:
{resume_text[:800] if resume_text else 'Not provided'}

Return your response in this exact format:
SUBJECT: [subject line here]
BODY:
[email body here]

INSTRUCTIONS:
- Subject line should be specific and compelling (not generic)
- Email should be 3-4 short paragraphs
- First paragraph: reference something specific about the company or role
- Second paragraph: your strongest relevant qualification
- Third paragraph: what you can bring to their team specifically
- Closing: clear call to action with low pressure
- Formal but personable tone
- No em dashes or en dashes anywhere"""

    message = client.messages.create(
        model=MODEL,
        max_tokens=800,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    result = _clean_dashes(message.content[0].text)

    subject = ""
    body = result

    lines = result.split("\n")
    for i, line in enumerate(lines):
        if line.startswith("SUBJECT:"):
            subject = line.replace("SUBJECT:", "").strip()
        elif line.startswith("BODY:"):
            body = "\n".join(lines[i + 1:]).strip()
            break

    return {"subject": subject, "body": body}


async def analyze_job_post(post_content: str) -> dict:
    """Extract structured info from a raw job post."""
    client = _get_client()

    system_prompt = f"""You are an expert at parsing job posts and extracting structured information.
Always return valid JSON.
{NO_DASH_INSTRUCTION}"""

    user_prompt = f"""Extract structured information from this job post and return as JSON.

JOB POST:
{post_content[:2000]}

Return JSON with these fields (use null if not found):
{{
  "title": "job title",
  "company": "company name",
  "location": "location or null",
  "is_remote": true/false,
  "job_type": "full-time/contract/part-time/internship or null",
  "salary_range": "salary info or null",
  "required_skills": ["skill1", "skill2"],
  "nice_to_have_skills": ["skill1"],
  "years_experience": "experience requirement or null",
  "poster_name": "name of person who posted or null",
  "poster_title": "their title or null",
  "summary": "2-3 sentence summary of the role"
}}"""

    message = client.messages.create(
        model=MODEL,
        max_tokens=600,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    import json
    result_text = message.content[0].text
    try:
        start = result_text.find("{")
        end = result_text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(result_text[start:end])
    except (json.JSONDecodeError, ValueError):
        pass

    return {
        "title": None,
        "company": None,
        "location": None,
        "is_remote": False,
        "job_type": None,
        "salary_range": None,
        "required_skills": [],
        "nice_to_have_skills": [],
        "years_experience": None,
        "poster_name": None,
        "poster_title": None,
        "summary": post_content[:200],
    }


async def suggest_talking_points(
    job_info: dict,
    person_info: dict,
    resume_text: str,
) -> list:
    """Generate 3-5 personalized talking points for outreach."""
    client = _get_client()

    system_prompt = f"""You are a career coach who helps job seekers identify the strongest talking points for outreach.
{NO_DASH_INSTRUCTION}"""

    user_prompt = f"""Generate 3-5 specific talking points for someone reaching out about this job.

JOB: {job_info.get('title', 'role')} at {job_info.get('company', 'company')}
JOB DESCRIPTION: {job_info.get('post_content', '')[:500]}
POSTER: {person_info.get('name', 'unknown')} - {person_info.get('title', 'unknown title')}
CANDIDATE BACKGROUND: {resume_text[:600] if resume_text else 'Not provided'}

Return 3-5 talking points as a JSON array of strings. Each should be specific and actionable.
Example format: ["Point 1 here", "Point 2 here", "Point 3 here"]
No em dashes or en dashes in any point."""

    message = client.messages.create(
        model=MODEL,
        max_tokens=400,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    import json
    result_text = _clean_dashes(message.content[0].text)
    try:
        start = result_text.find("[")
        end = result_text.rfind("]") + 1
        if start >= 0 and end > start:
            return json.loads(result_text[start:end])
    except (json.JSONDecodeError, ValueError):
        pass

    lines = [line.strip().lstrip("-*").strip() for line in result_text.split("\n") if line.strip()]
    return [line for line in lines if len(line) > 10][:5]


async def tailor_resume(job_info: dict, resume_text: str) -> dict:
    """
    Deep ATS analysis: scores resume across 8 dimensions, extracts missing keywords,
    rewrites bullets with action verbs + quantification, audits format compliance.
    Based on research into how modern ATS systems (Workday, Greenhouse, Lever, Taleo,
    iCIMS) parse and rank resumes.
    """
    import json as _json

    client = _get_client()

    system_prompt = f"""You are a senior resume strategist and ATS expert with deep knowledge of how
Applicant Tracking Systems work. You have studied Workday, Greenhouse, Lever, Taleo, iCIMS, and
Jobvite parsing algorithms. You know that:

ATS PARSING FACTS:
- ATS systems do keyword frequency matching against the job description
- Section headers must be standard: Summary/Objective, Experience/Work Experience,
  Education, Skills/Technical Skills, Certifications, Projects
- Tables, text boxes, columns, headers/footers, and graphics cause parsing failures
- The most ATS-compatible format is a single-column, plain-text-parseable document
- File format: DOCX is most reliable, then simple single-layer PDF
- Fonts: Arial, Calibri, Garamond, Georgia, Helvetica, Times New Roman only
- Font size 10-12pt body, 14-16pt name, 11-12pt section headers
- Bullet points must use standard characters (- or *), not fancy Unicode bullets
- Dates must be consistent: "Month YYYY - Month YYYY" or "MM/YYYY" format
- Contact info must be in the body, never in a header/footer element
- Keywords must appear in context, not just stuffed in a skills list
- Action verbs at the start of every bullet: Led, Built, Designed, Increased, Reduced,
  Managed, Delivered, Launched, Optimized, Architected, Scaled, etc.
- Quantify every achievement: %, $, time saved, team size, users, revenue
- The title on your resume should mirror the exact job title in the posting
- LinkedIn URL, GitHub, portfolio links increase ATS score on modern systems
- Avoid personal pronouns (I, me, my) anywhere in the resume

SCORING METHODOLOGY:
- Keyword match (30 points): exact phrases from JD appear in resume
- Format compliance (20 points): no tables/columns/graphics, standard headers, parseable
- Action verb quality (15 points): strong verbs, no weak verbs like "helped" or "assisted"
- Quantification (15 points): % of bullets with numbers/metrics
- Summary alignment (10 points): summary mirrors the exact role/company
- Section completeness (5 points): all required sections present
- Contact completeness (3 points): name, email, phone, LinkedIn, location
- File/format hygiene (2 points): proper font, size, margins, length

You always return valid JSON and nothing else.
{NO_DASH_INSTRUCTION}"""

    user_prompt = f"""Perform a comprehensive ATS audit of this resume against the job description.

JOB TITLE: {job_info.get('title', 'Not specified')}
COMPANY: {job_info.get('company', 'Not specified')}
JOB DESCRIPTION:
{job_info.get('post_content', '')[:3000]}

RESUME:
{resume_text[:4000] if resume_text else 'No resume provided'}

Return a JSON object with EXACTLY these fields:

{{
  "match_score": <integer 0-100, overall ATS compatibility score>,
  "score_breakdown": {{
    "keyword_match": <0-30, how many JD keywords appear naturally in resume>,
    "format_compliance": <0-20, ATS-safe formatting score>,
    "action_verbs": <0-15, strong action verb usage>,
    "quantification": <0-15, % of bullets with metrics/numbers>,
    "summary_alignment": <0-10, how well summary mirrors this specific role>,
    "section_completeness": <0-5, all required sections present>,
    "contact_completeness": <0-3, name/email/phone/LinkedIn/location>,
    "format_hygiene": <0-2, font/size/margins/length>
  }},
  "tailored_summary": "<rewritten 3-sentence professional summary that opens with the exact job title from the posting, incorporates top 3 keywords from JD, and quantifies one achievement>",
  "missing_keywords": [
    {{"term": "exact phrase from JD", "priority": "high/medium/low", "context": "where/how to add it"}}
  ],
  "keyword_hits": ["keywords already present in resume that match JD"],
  "bullet_rewrites": [
    {{"original": "weak bullet from resume", "rewritten": "strong ATS-optimized version with action verb + metric"}}
  ],
  "bullets_to_add": [
    "<new bullet point starting with strong action verb, including a metric, tailored to JD>"
  ],
  "format_issues": [
    "<specific format problem detected and how to fix it>"
  ],
  "section_advice": [
    "<specific advice about a section: reorder, rename, add, or restructure>"
  ],
  "gaps": ["<honest gap between JD requirements and resume - be specific>"],
  "strengths": ["<specific strength that directly matches a JD requirement>"],
  "quick_wins": ["<single-sentence change that would immediately boost ATS score>"],
  "ats_verdict": "<2-3 sentence overall verdict: will this pass ATS? what is the #1 change to make?>"
}}

Rules:
- match_score = sum of all score_breakdown values
- missing_keywords: list the 8-12 most important phrases from the JD not in the resume
- bullet_rewrites: pick the 3-4 weakest existing bullets and show how to rewrite them
- bullets_to_add: 3-5 entirely new bullets the candidate should add (based on their background)
- format_issues: audit for tables, columns, headers/footers, non-standard fonts, graphics - list any issues
- quick_wins: 3-5 changes that take under 5 minutes and have high impact
- No em dashes or en dashes anywhere"""

    message = client.messages.create(
        model=MODEL,
        max_tokens=2500,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    result_text = _clean_dashes(message.content[0].text)

    try:
        start = result_text.find("{")
        end = result_text.rfind("}") + 1
        if start >= 0 and end > start:
            parsed = _json.loads(result_text[start:end])
            return {
                "match_score": int(parsed.get("match_score", 50)),
                "score_breakdown": parsed.get("score_breakdown", {}),
                "tailored_summary": str(parsed.get("tailored_summary", "")),
                "missing_keywords": list(parsed.get("missing_keywords", [])),
                "keyword_hits": list(parsed.get("keyword_hits", [])),
                "bullet_rewrites": list(parsed.get("bullet_rewrites", [])),
                "bullets_to_add": list(parsed.get("bullets_to_add", [])),
                "format_issues": list(parsed.get("format_issues", [])),
                "section_advice": list(parsed.get("section_advice", [])),
                "gaps": list(parsed.get("gaps", [])),
                "strengths": list(parsed.get("strengths", [])),
                "quick_wins": list(parsed.get("quick_wins", [])),
                "ats_verdict": str(parsed.get("ats_verdict", "")),
                # backward compat aliases
                "keywords_to_add": [k["term"] if isinstance(k, dict) else k for k in parsed.get("missing_keywords", [])],
                "bullet_points_to_add": list(parsed.get("bullets_to_add", [])),
                "sections_to_highlight": list(parsed.get("section_advice", [])),
            }
    except (_json.JSONDecodeError, ValueError, TypeError):
        pass

    return {
        "match_score": 50, "score_breakdown": {}, "tailored_summary": "",
        "missing_keywords": [], "keyword_hits": [], "bullet_rewrites": [],
        "bullets_to_add": [], "format_issues": [], "section_advice": [],
        "gaps": ["Could not parse analysis."], "strengths": [],
        "quick_wins": [], "ats_verdict": "",
        "keywords_to_add": [], "bullet_points_to_add": [], "sections_to_highlight": [],
    }


async def generate_ats_resume(job_info: dict, resume_text: str, candidate_name: str = "") -> dict:
    """
    Generate a complete, fully rewritten ATS-optimized resume tailored to this specific job.
    Returns structured sections ready to be rendered into a DOCX document.
    Applies all ATS best practices: single column, standard headers, action verbs,
    quantified bullets, exact keyword integration, proper formatting.
    """
    import json as _json

    client = _get_client()

    system_prompt = f"""You are a world-class resume writer who has helped candidates land roles at
FAANG, top startups, and Fortune 500 companies. You write resumes that score 95+ on every ATS system.

Your resume writing principles:
1. EVERY bullet starts with a past-tense action verb (Led, Built, Architected, Delivered, etc.)
2. EVERY bullet has at least one metric (%, $, time, team size, scale, speed)
3. The professional summary mirrors the EXACT job title and uses keywords from the JD in the first sentence
4. Skills section lists the exact tool names from the JD (not synonyms)
5. Job titles in experience are adjusted to be as close as possible to the target title
6. Keywords from the JD are woven naturally into context, not just listed
7. No tables, no columns, no text boxes, no headers/footers - pure single-column layout
8. Standard section names: Summary, Experience, Skills, Education, Certifications, Projects
9. Consistent date format throughout: "Month YYYY - Month YYYY"
10. Contact line: Name | Email | Phone | LinkedIn | Location
{NO_DASH_INSTRUCTION}"""

    user_prompt = f"""Rewrite this resume completely, optimized for this specific job.
Preserve all real experience and facts from the original resume. Do NOT invent new jobs or degrees.
Rewrite, reorder, and strengthen what exists.

TARGET JOB TITLE: {job_info.get('title', 'Not specified')}
TARGET COMPANY: {job_info.get('company', 'Not specified')}
JOB DESCRIPTION:
{job_info.get('post_content', '')[:3000]}

ORIGINAL RESUME:
{resume_text[:4000] if resume_text else 'No resume'}

Return a JSON object with this EXACT structure:
{{
  "candidate_name": "{candidate_name or 'Candidate Name'}",
  "contact_line": "email@example.com | +1 (555) 000-0000 | linkedin.com/in/username | City, State",
  "summary": "<3-sentence professional summary: sentence 1 opens with exact target job title + years of experience, sentence 2 highlights top 2 matching skills with metrics, sentence 3 states value proposition for this company>",
  "skills": {{
    "technical": ["skill1", "skill2", ...],
    "tools": ["tool1", "tool2", ...],
    "soft": ["Leadership", "Cross-functional collaboration", ...]
  }},
  "experience": [
    {{
      "title": "Job Title (adjusted toward target title where honest)",
      "company": "Company Name",
      "location": "City, State or Remote",
      "start": "Month YYYY",
      "end": "Month YYYY or Present",
      "bullets": [
        "Action verb + what you did + metric/result",
        "Action verb + what you did + metric/result"
      ]
    }}
  ],
  "education": [
    {{
      "degree": "Degree Name",
      "school": "University Name",
      "year": "YYYY",
      "gpa": "X.X (only include if 3.5+)",
      "honors": "magna cum laude / relevant coursework / etc (or null)"
    }}
  ],
  "certifications": ["Cert Name - Issuer (Year)", ...],
  "projects": [
    {{
      "name": "Project Name",
      "description": "One sentence with tech stack and impact metric",
      "url": "github.com/... (or null)"
    }}
  ],
  "ats_keywords_integrated": ["list of JD keywords that were naturally woven into this resume"],
  "optimization_notes": ["note about what was changed and why"]
}}

CRITICAL RULES:
- Keep ALL real employers, job titles, dates, degrees - never fabricate
- Rewrite every bullet to start with a strong action verb and include a metric
- Integrate at least 10 keywords from the job description naturally in context
- The summary MUST open with the exact target job title
- Skills section must list every tool mentioned in the JD that the candidate has used
- No em dashes or en dashes anywhere"""

    message = client.messages.create(
        model=MODEL,
        max_tokens=4000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    result_text = _clean_dashes(message.content[0].text)

    try:
        start = result_text.find("{")
        end = result_text.rfind("}") + 1
        if start >= 0 and end > start:
            return _json.loads(result_text[start:end])
    except (_json.JSONDecodeError, ValueError, TypeError) as e:
        print(f"Resume generation parse error: {e}")

    return {}


async def filter_hiring_posts(posts: list) -> list:
    """
    Use Claude to filter a batch of scraped posts to only genuine personal hiring announcements.
    Removes false positives: job listing aggregators, company career pages, news articles, etc.
    """
    if not posts:
        return []

    import json as _json
    client = _get_client()

    # Batch into groups of 10
    filtered = []
    for i in range(0, len(posts), 10):
        batch = posts[i:i + 10]
        summaries = []
        for idx, p in enumerate(batch):
            content = (p.get("post_content") or "")[:400]
            url = p.get("post_url", "")
            summaries.append(f'[{idx}] URL: {url}\nCONTENT: {content}')

        prompt = f"""You are filtering scraped web results. For each item below, determine if it is a GENUINE PERSONAL hiring post - meaning a real person (hiring manager, founder, team lead, recruiter) wrote a personal post/message saying their team or company is actively searching for someone right now.

REJECT these false positives:
- Formal job listing pages (LinkedIn Jobs, Indeed, Glassdoor listings)
- Company career pages
- News articles about a company
- Blog posts or generic articles about hiring
- Any result where no real person is writing personally about hiring

ACCEPT only posts that read like a real person personally writing: "We're hiring X", "My team needs a Y", "Looking for a Z to join us", "DM me if interested", etc.

Items to classify:
{chr(10).join(summaries)}

Return a JSON array of indices (0-based) that are genuine personal hiring posts.
Example: [0, 2, 5]
Return only the JSON array, nothing else."""

        try:
            msg = client.messages.create(
                model=MODEL,
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            result_text = msg.content[0].text.strip()
            start = result_text.find("[")
            end = result_text.rfind("]") + 1
            if start >= 0 and end > start:
                accepted_indices = _json.loads(result_text[start:end])
                for idx in accepted_indices:
                    if isinstance(idx, int) and 0 <= idx < len(batch):
                        filtered.append(batch[idx])
            else:
                # If parse fails, keep all (fail open)
                filtered.extend(batch)
        except Exception as e:
            print(f"LLM filtering error: {e}")
            filtered.extend(batch)

    return filtered


async def extract_funded_company_intel(article_title: str, article_snippet: str, article_url: str) -> dict:
    """
    Use Claude to extract structured intelligence from a funding news article snippet.
    Returns structured company data.
    """
    import json as _json
    client = _get_client()

    prompt = f"""Extract structured company intelligence from this funding news snippet.

TITLE: {article_title}
SNIPPET: {article_snippet}
URL: {article_url}

Return JSON with these fields (null if not found):
{{
  "company_name": "company name",
  "funding_amount": "$XM or $XB",
  "funding_round": "Seed/Series A/Series B/etc",
  "sector": "industry sector (e.g. AI, Fintech, HealthTech)",
  "founded_year": null,
  "founder_name": "founder or CEO name if mentioned",
  "is_hiring": true/false,
  "description": "one sentence about what the company does",
  "headquarters": "city/country if mentioned"
}}

Return only the JSON object, nothing else."""

    try:
        msg = client.messages.create(
            model=MODEL,
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        text = _clean_dashes(msg.content[0].text)
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            return _json.loads(text[start:end])
    except Exception as e:
        print(f"funded intel extraction error: {e}")
    return {}
