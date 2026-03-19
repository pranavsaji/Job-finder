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

    poster_title = (person_info.get("title") or "").lower()
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

    user_prompt = f"""You are rewriting this candidate's resume SPECIFICALLY for the job below.

CRITICAL RULES:
- Use the original resume ONLY as a source of facts (employers, dates, degrees, projects).
- REWRITE every single bullet from scratch — do NOT copy any sentence from the original.
- Every bullet must be tailored to match what THIS specific job description asks for.
- Front-load keywords from the JD naturally into bullets and summary.
- Do NOT output anything that could appear word-for-word in the original resume.

TARGET JOB TITLE: {job_info.get('title', 'Not specified')}
TARGET COMPANY: {job_info.get('company', 'Not specified')}
JOB DESCRIPTION:
{job_info.get('post_content', '')[:3000]}

ORIGINAL RESUME (use as fact-source only — rewrite all text):
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


def generate_cover_letter(
    resume_text: str,
    company: str,
    role: str,
    job_description: str,
    tone: str = "professional",
) -> str:
    """Generate a tailored cover letter. Synchronous (no async needed for single call)."""
    tone_instructions = {
        "professional": "formal, polished, traditional business letter style",
        "conversational": "warm, authentic, slightly informal but respectful",
        "bold": "confident, direct, memorable - lead with impact not formality",
    }.get(tone, "formal, polished, traditional business letter style")

    client = _get_client()
    prompt = f"""Write a tailored cover letter for this job application.

TONE: {tone_instructions}

APPLICANT RESUME:
{resume_text[:1500] if resume_text else "No resume provided"}

COMPANY: {company}
ROLE: {role}
JOB DESCRIPTION:
{job_description[:1000] if job_description else "Not provided"}

Requirements:
- 3 paragraphs: hook + why you fit + why this company + call to action
- Under 300 words
- Specific: reference actual skills/experience from resume
- Do NOT use generic phrases like "I am writing to express my interest"
- Start with something compelling about your fit or the company
- No placeholder text like [Your Name] - write the actual letter body only (no header/date/address)
- No em dashes or en dashes anywhere"""

    resp = client.messages.create(
        model=MODEL,
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    return _clean_dashes(resp.content[0].text.strip())


async def critique_resume_stream(resume_text: str, job_description: str = ""):
    """
    Stream the resume critique JSON via async generator.
    Sends raw text chunks; caller accumulates and parses at the end.
    Full resume is sent — no truncation.
    """
    import anthropic as _anthropic_mod

    system_prompt, user_prompt = _build_critique_prompts(resume_text, job_description)
    client = _anthropic_mod.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    async with client.messages.stream(
        model=MODEL,
        max_tokens=3000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    ) as stream:
        async for text in stream.text_stream:
            yield text


def _build_critique_prompts(resume_text: str, job_description: str) -> tuple:
    """Extract prompt building so both the streaming and sync paths share the same prompts."""
    system_prompt = f"""You are Jordan Mills, a Principal Recruiter with 15 years of in-the-field experience.
You have personally reviewed and screened over 80,000 resumes. You currently run full-cycle recruiting
for 6-8 open roles simultaneously, processing 1,000 to 1,400 applications every week.

You sit in the rooms where hiring decisions are made. You know:
- What a Staff Engineer resume looks like vs. a Senior Engineer resume vs. a bootcamp grad trying to fake it
- Which companies' names carry weight and which are noise
- What a resume that got a Google L5 offer looks like compared to one that got auto-rejected
- The difference between metrics that are real ("reduced P99 latency from 800ms to 120ms") and metrics that are fabricated ("improved performance by 40%")
- Which skills are genuinely in-demand right now vs. which ones are outdated filler
- When a career gap is a problem vs. when it doesn't matter at all
- The exact formatting patterns that get flagged by Greenhouse, Workday, and Lever ATS systems

Your field knowledge is current. You know what the actual hiring bar looks like RIGHT NOW in this market:
- Layoffs have flooded the market: competition is brutal. The average tech role gets 300-600 applications.
- Hiring managers are more risk-averse. Unconventional backgrounds need MORE evidence, not less.
- AI-generated resume content is now easy to detect: generic, buzzword-heavy, no specific details.
- Remote work claims need backing (you've seen candidates claim remote experience they fabricated).
- Skills sections that list 40+ technologies are a red flag for shallow breadth vs. deep expertise.

You give the same feedback you give to candidates you actually like and want to succeed.
That means: brutal honesty, specific quotes, exact fixes, no softening.

You think like a human screener, not an ATS:
- Does the career story make sense? Are there unexplained jumps?
- Does the experience level match what they claim to be applying for?
- Is there evidence of real impact, or just job descriptions disguised as achievements?
- Would I stake my professional reputation on forwarding this?

You always return valid JSON. {NO_DASH_INSTRUCTION}"""

    jd_section = f"\nROLE THEY ARE TARGETING:\n{job_description[:2000]}\n" if job_description.strip() else "\n(No specific role provided - giving general market critique)\n"

    user_prompt = f"""You are processing your morning screening queue. This resume just landed.
You have 6 seconds. Then you go deep.

{jd_section}
RESUME (full, untruncated):
{resume_text}

Return a JSON critique with EXACTLY this structure. Be specific. Quote actual text. No softening.

{{
  "recruiter_score": <integer 0-100: 0-40=immediate pass, 41-60=maybe pile, 61-79=phone screen, 80-100=fast track>,
  "would_forward": <true/false>,
  "forward_verdict": "<one direct sentence: why you would or wouldn't forward this right now>",
  "first_impression": "<raw gut reaction in the first 6 seconds -- be specific, quote what you see, say exactly what works or doesn't>",

  "experience_verdict": {{
    "level_match": "under-qualified/matched/over-qualified/unclear",
    "years_claimed": "<your estimate of their real experience level>",
    "credibility": "high/medium/low",
    "credibility_reason": "<1 sentence: what makes you trust or doubt the experience claims>"
  }},

  "narrative_analysis": {{
    "career_story_score": <0-10>,
    "is_coherent": <true/false>,
    "trajectory": "ascending/lateral/declining/unclear",
    "gaps_or_red_flags": ["<unexplained gap or suspicious pattern>"],
    "story_verdict": "<2 sentences: what story does this career tell? Is it compelling?>"
  }},

  "market_benchmarks": {{
    "vs_similar_candidates": "below average/average/above average/top 10%",
    "interview_probability": "<percentage chance this gets a phone screen in a competitive market>",
    "biggest_differentiator": "<the one thing that sets this apart from the pile, or null if nothing does>",
    "biggest_liability": "<the one thing most likely to get this auto-rejected>",
    "market_context": "<2 sentences: how does this land in the current job market? What are they up against?>"
  }},

  "red_flags": [
    {{
      "severity": "dealbreaker/major/minor",
      "flag": "<the specific issue>",
      "quote": "<exact text from resume that triggered this, or null>",
      "fix": "<exactly what to change -- be specific>"
    }}
  ],

  "section_analysis": {{
    "summary": {{
      "score": <0-10>,
      "verdict": "<1 direct sentence>",
      "specific_issues": ["<exact issue 1>", "<exact issue 2>"],
      "rewrite": "<if score < 7, write a better version using their actual background; otherwise null>"
    }},
    "experience": {{
      "score": <0-10>,
      "verdict": "<1 direct sentence>",
      "weakest_bullets": ["<quote the 2-3 worst bullets verbatim>"],
      "pattern_problems": ["<recurring structural problem across bullets>"],
      "best_bullet": "<quote the single strongest bullet and explain briefly why it works>",
      "impact_ratio": "<what % of bullets have real metrics? e.g. 2 out of 8 bullets (25%) have metrics>"
    }},
    "skills": {{
      "score": <0-10>,
      "verdict": "<1 direct sentence>",
      "issues": ["<specific skill section problems>"],
      "missing_critical": ["<skills that should be here given their experience level>"]
    }},
    "education": {{
      "score": <0-10>,
      "verdict": "<1 direct sentence>",
      "relevance": "high/medium/low/not applicable"
    }},
    "overall_format": {{
      "score": <0-10>,
      "verdict": "<1 direct sentence>",
      "issues": ["<specific format issues that would hurt them in ATS or with human screeners>"],
      "ats_risks": ["<anything that could get auto-filtered before a human sees it>"]
    }}
  }},

  "what_works": ["<3-5 genuinely strong elements -- specific, not generic>"],

  "top_3_fixes": [
    "<the single change with highest ROI -- do this first>",
    "<second most impactful change>",
    "<third most impactful change>"
  ],

  "rebuild_directives": {{
    "summary_instruction": "<exact instruction for rewriting the summary>",
    "bullet_formula": "<the specific formula every bullet should follow for this person's background>",
    "skills_restructure": "<how to reorganize the skills section>",
    "critical_additions": ["<content that must be added -- specific>"],
    "critical_removals": ["<content that must be cut -- specific>"]
  }},

  "competitive_assessment": "<2-3 sentences: how does this stack up right now against the 200+ other applications they are competing with? Are they getting interviews or not?>",
  "hiring_manager_note": "<the exact note you would write to the hiring manager -- or your exact words for why you are passing>"
}}

Rules:
- Quote actual resume text when citing problems (use verbatim quotes)
- red_flags: find ALL of them, min 2, max 10, ranked by severity
- experience_verdict and narrative_analysis require genuine analysis of their trajectory
- market_benchmarks must reflect current market reality, not generic advice
- rebuild_directives must be specific enough that someone can act on them immediately
- No em dashes or en dashes anywhere in your response"""

    return system_prompt, user_prompt


def critique_resume(resume_text: str, job_description: str = "") -> dict:
    """
    Deep resume critique from the perspective of a senior field recruiter who sees
    1000+ resumes daily. Returns structured JSON critique with market benchmarks,
    narrative analysis, experience verdict, and detailed rebuild directives.
    """
    import json as _json

    client = _get_client()

    system_prompt = f"""You are Jordan Mills, a Principal Recruiter with 15 years of in-the-field experience.
You have personally reviewed and screened over 80,000 resumes. You currently run full-cycle recruiting
for 6-8 open roles simultaneously, processing 1,000 to 1,400 applications every week.

You sit in the rooms where hiring decisions are made. You know:
- What a Staff Engineer resume looks like vs. a Senior Engineer resume vs. a bootcamp grad trying to fake it
- Which companies' names carry weight and which are noise
- What a resume that got a Google L5 offer looks like compared to one that got auto-rejected
- The difference between metrics that are real ("reduced P99 latency from 800ms to 120ms") and metrics that are fabricated ("improved performance by 40%")
- Which skills are genuinely in-demand right now vs. which ones are outdated filler
- When a career gap is a problem vs. when it doesn't matter at all
- The exact formatting patterns that get flagged by Greenhouse, Workday, and Lever ATS systems

Your field knowledge is current. You know what the actual hiring bar looks like RIGHT NOW in this market:
- Layoffs have flooded the market: competition is brutal. The average tech role gets 300-600 applications.
- Hiring managers are more risk-averse. Unconventional backgrounds need MORE evidence, not less.
- AI-generated resume content is now easy to detect: generic, buzzword-heavy, no specific details.
- Remote work claims need backing (you've seen candidates claim remote experience they fabricated).
- Skills sections that list 40+ technologies are a red flag for shallow breadth vs. deep expertise.

You give the same feedback you give to candidates you actually like and want to succeed.
That means: brutal honesty, specific quotes, exact fixes, no softening.

You think like a human screener, not an ATS:
- Does the career story make sense? Are there unexplained jumps?
- Does the experience level match what they claim to be applying for?
- Is there evidence of real impact, or just job descriptions disguised as achievements?
- Would I stake my professional reputation on forwarding this?

You always return valid JSON. {NO_DASH_INSTRUCTION}"""

    jd_section = f"\nROLE THEY ARE TARGETING:\n{job_description[:2000]}\n" if job_description.strip() else "\n(No specific role provided - giving general market critique)\n"

    user_prompt = f"""You are processing your morning screening queue. This resume just landed.
You have 6 seconds. Then you go deep.

{jd_section}
RESUME:
{resume_text[:4000] if resume_text else 'No resume provided'}

Return a JSON critique with EXACTLY this structure. Be specific. Quote actual text. No softening.

{{
  "recruiter_score": <integer 0-100: 0-40=immediate pass, 41-60=maybe pile, 61-79=phone screen, 80-100=fast track>,
  "would_forward": <true/false>,
  "forward_verdict": "<one direct sentence: why you would or wouldn't forward this right now>",
  "first_impression": "<raw gut reaction in the first 6 seconds — be specific, quote what you see, say exactly what works or doesn't>",

  "experience_verdict": {{
    "level_match": "under-qualified/matched/over-qualified/unclear",
    "years_claimed": "<your estimate of their real experience level>",
    "credibility": "high/medium/low",
    "credibility_reason": "<1 sentence: what makes you trust or doubt the experience claims>"
  }},

  "narrative_analysis": {{
    "career_story_score": <0-10>,
    "is_coherent": <true/false>,
    "trajectory": "ascending/lateral/declining/unclear",
    "gaps_or_red_flags": ["<unexplained gap or suspicious pattern>"],
    "story_verdict": "<2 sentences: what story does this career tell? Is it compelling?>"
  }},

  "market_benchmarks": {{
    "vs_similar_candidates": "below average/average/above average/top 10%",
    "interview_probability": "<percentage chance this gets a phone screen in a competitive market>",
    "biggest_differentiator": "<the one thing that sets this apart from the pile, or null if nothing does>",
    "biggest_liability": "<the one thing most likely to get this auto-rejected>",
    "market_context": "<2 sentences: how does this land in the current job market? What are they up against?>"
  }},

  "red_flags": [
    {{
      "severity": "dealbreaker/major/minor",
      "flag": "<the specific issue>",
      "quote": "<exact text from resume that triggered this, or null>",
      "fix": "<exactly what to change — be specific>"
    }}
  ],

  "section_analysis": {{
    "summary": {{
      "score": <0-10>,
      "verdict": "<1 direct sentence>",
      "specific_issues": ["<exact issue 1>", "<exact issue 2>"],
      "rewrite": "<if score < 7, write a better version using their actual background; otherwise null>"
    }},
    "experience": {{
      "score": <0-10>,
      "verdict": "<1 direct sentence>",
      "weakest_bullets": ["<quote the 2-3 worst bullets verbatim>"],
      "pattern_problems": ["<recurring structural problem across bullets>"],
      "best_bullet": "<quote the single strongest bullet and explain briefly why it works>",
      "impact_ratio": "<what % of bullets have real metrics? e.g. 2 out of 8 bullets (25%) have metrics>"
    }},
    "skills": {{
      "score": <0-10>,
      "verdict": "<1 direct sentence>",
      "issues": ["<specific skill section problems>"],
      "missing_critical": ["<skills that should be here given their experience level>"]
    }},
    "education": {{
      "score": <0-10>,
      "verdict": "<1 direct sentence>",
      "relevance": "high/medium/low/not applicable"
    }},
    "overall_format": {{
      "score": <0-10>,
      "verdict": "<1 direct sentence>",
      "issues": ["<specific format issues that would hurt them in ATS or with human screeners>"],
      "ats_risks": ["<anything that could get auto-filtered before a human sees it>"]
    }}
  }},

  "what_works": ["<3-5 genuinely strong elements — specific, not generic>"],

  "top_3_fixes": [
    "<the single change with highest ROI — do this first>",
    "<second most impactful change>",
    "<third most impactful change>"
  ],

  "rebuild_directives": {{
    "summary_instruction": "<exact instruction for rewriting the summary>",
    "bullet_formula": "<the specific formula every bullet should follow for this person's background>",
    "skills_restructure": "<how to reorganize the skills section>",
    "critical_additions": ["<content that must be added — specific>"],
    "critical_removals": ["<content that must be cut — specific>"]
  }},

  "competitive_assessment": "<2-3 sentences: how does this stack up right now against the 200+ other applications they are competing with? Are they getting interviews or not?>",
  "hiring_manager_note": "<the exact note you would write to the hiring manager — or your exact words for why you are passing>"
}}

Rules:
- Quote actual resume text when citing problems (use verbatim quotes)
- red_flags: find ALL of them, min 2, max 10, ranked by severity
- experience_verdict and narrative_analysis require genuine analysis of their trajectory
- market_benchmarks must reflect current market reality, not generic advice
- rebuild_directives must be specific enough that someone can act on them immediately
- No em dashes or en dashes anywhere in your response"""

    resp = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    result_text = _clean_dashes(resp.content[0].text.strip())

    try:
        start = result_text.find("{")
        end = result_text.rfind("}") + 1
        if start >= 0 and end > start:
            return _json.loads(result_text[start:end])
    except (_json.JSONDecodeError, ValueError):
        pass

    return {
        "recruiter_score": 50,
        "would_forward": False,
        "forward_verdict": "Could not parse critique.",
        "first_impression": "Analysis failed.",
        "experience_verdict": {"level_match": "unclear", "years_claimed": "unknown", "credibility": "medium", "credibility_reason": "Analysis failed."},
        "narrative_analysis": {"career_story_score": 5, "is_coherent": True, "trajectory": "unclear", "gaps_or_red_flags": [], "story_verdict": "Analysis failed."},
        "market_benchmarks": {"vs_similar_candidates": "average", "interview_probability": "unknown", "biggest_differentiator": None, "biggest_liability": "Analysis failed.", "market_context": ""},
        "red_flags": [],
        "section_analysis": {},
        "what_works": [],
        "top_3_fixes": [],
        "rebuild_directives": {"summary_instruction": "", "bullet_formula": "", "skills_restructure": "", "critical_additions": [], "critical_removals": []},
        "competitive_assessment": "",
        "hiring_manager_note": "",
    }


async def build_resume_from_critique(
    resume_text: str,
    critique: dict,
    job_description: str = "",
    candidate_name: str = "",
) -> dict:
    """
    Build a completely new resume that directly addresses every issue from the critique.
    Returns structured resume data for DOCX generation.
    """
    import json as _json

    client = _get_client()

    # Summarize the critique into actionable directives
    red_flags = critique.get("red_flags", [])
    top_fixes = critique.get("top_3_fixes", [])
    section = critique.get("section_analysis", {})
    summary_rewrite = (section.get("summary") or {}).get("rewrite") or ""
    weak_bullets = (section.get("experience") or {}).get("weakest_bullets", [])
    bullet_problems = (section.get("experience") or {}).get("pattern_problems", [])
    format_issues = (section.get("overall_format") or {}).get("issues", [])
    ats_risks = (section.get("overall_format") or {}).get("ats_risks", [])
    missing_skills = (section.get("skills") or {}).get("missing_critical", [])

    # Pull rebuild_directives if present (from enhanced critique)
    rd = critique.get("rebuild_directives", {})
    bullet_formula = rd.get("bullet_formula", "")
    summary_instruction = rd.get("summary_instruction", "")
    skills_restructure = rd.get("skills_restructure", "")
    critical_additions = rd.get("critical_additions", [])
    critical_removals = rd.get("critical_removals", [])

    # Pull market and experience context
    ev = critique.get("experience_verdict", {})
    na = critique.get("narrative_analysis", {})
    mb = critique.get("market_benchmarks", {})

    critique_summary = f"""CRITIQUE FINDINGS (fix ALL of these):

Recruiter score: {critique.get('recruiter_score', 'N/A')}/100
Would forward: {'Yes' if critique.get('would_forward') else 'No'}
Forward verdict: {critique.get('forward_verdict', '')}

Red flags to eliminate:
{chr(10).join(f"- [{f['severity'].upper()}] {f['flag']} | Fix: {f['fix']}" for f in red_flags)}

Top priority fixes:
{chr(10).join(f"{i+1}. {fix}" for i, fix in enumerate(top_fixes))}

Bullet pattern problems to fix across ALL bullets:
{chr(10).join(f"- {p}" for p in bullet_problems)}

Format issues:
{chr(10).join(f"- {i}" for i in format_issues)}

ATS risks (must fix for automated screening):
{chr(10).join(f"- {r}" for r in ats_risks)}

Missing critical skills to add:
{chr(10).join(f"- {s}" for s in missing_skills)}

Recruiter's summary instruction:
{summary_instruction or (summary_rewrite if summary_rewrite else 'Rewrite completely to pass 6-second test')}

Bullet formula to use for every bullet:
{bullet_formula or 'Action Verb + specific what + measurable impact'}

Skills section restructure:
{skills_restructure or 'Reorganize into technical/tools/soft categories'}

Content to add (critical):
{chr(10).join(f"+ {a}" for a in critical_additions)}

Content to remove:
{chr(10).join(f"- {r}" for r in critical_removals)}

Weakest bullets (rewrite completely):
{chr(10).join(f'- "{b}"' for b in weak_bullets)}

Experience verdict: {ev.get('level_match', '')} | Credibility: {ev.get('credibility', '')}
Career trajectory: {na.get('trajectory', '')}
Market position: {mb.get('vs_similar_candidates', '')} | Interview probability: {mb.get('interview_probability', '')}
Biggest liability: {mb.get('biggest_liability', '')}"""

    jd_section = f"\nTARGET JOB DESCRIPTION:\n{job_description[:2000]}\n" if job_description.strip() else ""

    system_prompt = f"""You are a world-class resume writer who has read the recruiter's critique
of this candidate's resume. Your job is to build the best possible version of their resume
that directly addresses EVERY issue the recruiter raised.

You take the original resume as a source of facts (employers, dates, degrees, real accomplishments)
and completely rebuild it to fix all identified problems. You never fabricate facts.

Your rebuilt resume will be evaluated by the same brutal recruiter. It must earn an 80+ score.
{NO_DASH_INSTRUCTION}"""

    user_prompt = f"""Rebuild this resume to fix every issue the recruiter identified.

ORIGINAL RESUME (facts only — rewrite all text):
{resume_text[:4000] if resume_text else 'No resume'}
{jd_section}
{critique_summary}

REBUILD REQUIREMENTS:
1. Fix EVERY red flag listed above
2. Rewrite ALL weak bullets with strong action verbs + specific metrics
3. Fix ALL bullet pattern problems across every position
4. Fix ALL format issues
5. Write a compelling summary that passes the 6-second test
6. Keep all real employers, dates, degrees — never fabricate facts
7. Every bullet: Action Verb + What you did + Measurable impact

Return the same JSON structure as generate_ats_resume:
{{
  "candidate_name": "{candidate_name or 'Candidate Name'}",
  "contact_line": "email@example.com | +1 (555) 000-0000 | linkedin.com/in/username | City, State",
  "summary": "<3-sentence summary that passes the 6-second test — specific, metric-driven, no cliches>",
  "skills": {{
    "technical": ["skill1", "skill2"],
    "tools": ["tool1", "tool2"],
    "soft": ["Leadership", "Cross-functional collaboration"]
  }},
  "experience": [
    {{
      "title": "Job Title",
      "company": "Company Name",
      "location": "City, State or Remote",
      "start": "Month YYYY",
      "end": "Month YYYY or Present",
      "bullets": ["Action verb + what + metric", "Action verb + what + metric"]
    }}
  ],
  "education": [
    {{
      "degree": "Degree Name",
      "school": "University Name",
      "year": "YYYY",
      "gpa": "X.X or null",
      "honors": "honors or null"
    }}
  ],
  "certifications": ["Cert Name - Issuer (Year)"],
  "projects": [
    {{
      "name": "Project Name",
      "description": "One sentence with tech stack and impact",
      "url": "url or null"
    }}
  ],
  "critique_fixes_applied": ["<list each red flag you fixed and how>"],
  "optimization_notes": ["<what changed and why it will score higher with the recruiter>"]
}}

No em dashes or en dashes anywhere."""

    resp = client.messages.create(
        model=MODEL,
        max_tokens=4000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    result_text = _clean_dashes(resp.content[0].text.strip())

    try:
        start = result_text.find("{")
        end = result_text.rfind("}") + 1
        if start >= 0 and end > start:
            return _json.loads(result_text[start:end])
    except (_json.JSONDecodeError, ValueError, TypeError):
        pass

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
