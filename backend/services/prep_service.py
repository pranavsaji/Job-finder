"""
Interview prep pack generator.
Mines public interview data via DDG then synthesizes with Claude.
"""
import asyncio
import json
import re
from typing import Optional


def _ddgs_search(query: str, max_results: int = 6) -> list:
    try:
        from ddgs import DDGS
        ddgs = DDGS(timeout=15)
        return list(ddgs.text(query, max_results=max_results))
    except Exception as e:
        print(f"DDG prep error: {e}")
        return []


async def generate_prep_pack(company: str, role: str, job_description: str = "") -> dict:
    """
    Research a company's interview process and generate a structured prep pack.
    Returns sections: process, questions, technical_focus, culture, salary, tips.
    """
    loop = asyncio.get_event_loop()

    # Parallel research across multiple sources
    tasks = [
        loop.run_in_executor(None, _ddgs_search,
            f'site:glassdoor.com "{company}" interview questions {role}', 5),
        loop.run_in_executor(None, _ddgs_search,
            f'"{company}" interview process {role} questions 2024 OR 2025 OR 2026', 6),
        loop.run_in_executor(None, _ddgs_search,
            f'site:leetcode.com discuss "{company}" interview {role}', 4),
        loop.run_in_executor(None, _ddgs_search,
            f'"{company}" culture values engineering team 2025', 4),
        loop.run_in_executor(None, _ddgs_search,
            f'"{company}" "{role}" salary compensation 2025 OR 2026', 4),
        loop.run_in_executor(None, _ddgs_search,
            f'"{company}" "interview process" steps rounds timeline', 4),
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)
    (glassdoor_r, general_r, leetcode_r, culture_r, salary_r, process_r) = [
        r if isinstance(r, list) else [] for r in results
    ]

    # Build research context
    def _snippets(results_list: list) -> str:
        return "\n".join(
            f"- [{r.get('title', '')}]: {r.get('body', '')[:200]}"
            for r in results_list if r.get("body")
        )[:2000]

    interview_snippets = _snippets(glassdoor_r + general_r + leetcode_r)
    culture_snippets = _snippets(culture_r)
    salary_snippets = _snippets(salary_r)
    process_snippets = _snippets(process_r)

    # Use Claude to synthesize
    try:
        import anthropic as _anthropic
        import os as _os
        _api_key = _os.getenv("ANTHROPIC_API_KEY")
        if _api_key:
            client = _anthropic.Anthropic(api_key=_api_key)
            return await _claude_synthesize(
                client, company, role, job_description,
                interview_snippets, culture_snippets, salary_snippets, process_snippets
            )
    except Exception as e:
        print(f"Claude prep synthesis error: {e}")

    # Fallback: structured raw data
    return _build_raw_pack(
        company, role,
        glassdoor_r + general_r + leetcode_r,
        culture_r, salary_r, process_r,
    )


async def _claude_synthesize(
    client, company: str, role: str, job_description: str,
    interview_snippets: str, culture_snippets: str,
    salary_snippets: str, process_snippets: str,
) -> dict:
    jd_section = f"\nJob Description:\n{job_description[:1000]}" if job_description else ""

    prompt = f"""You are a career coach preparing someone for a {role} interview at {company}.{jd_section}

Use the research below. Be specific to {company}. Keep each field CONCISE (1 sentence max per item in lists).

INTERVIEW DATA:
{interview_snippets or "No specific interview data found."}

PROCESS DATA:
{process_snippets or "No process data found."}

CULTURE DATA:
{culture_snippets or "No culture data found."}

SALARY DATA:
{salary_snippets or "No salary data found."}

Respond with ONLY a JSON object (no markdown, no explanation), with exactly these keys:
{{"process":"2 sentence summary","rounds":["Round 1: name + brief desc","Round 2: ..."],"technical_focus":["Topic 1","Topic 2","Topic 3","Topic 4","Topic 5"],"likely_questions":["Q1?","Q2?","Q3?","Q4?","Q5?","Q6?"],"culture_notes":"2 sentence summary","salary_range":"range or null","questions_to_ask":["Q1","Q2","Q3","Q4"],"prep_tips":["Tip 1","Tip 2","Tip 3","Tip 4"],"red_flags":"concern or null"}}"""

    import json
    response = await asyncio.get_event_loop().run_in_executor(
        None,
        lambda: client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
    )
    text = response.content[0].text.strip()
    # Extract JSON
    m = __import__("re").search(r"\{[\s\S]+\}", text)
    if m:
        return json.loads(m.group(0))
    raise ValueError("No JSON in response")


def _build_raw_pack(
    company: str, role: str,
    interview_results: list, culture_results: list,
    salary_results: list, process_results: list,
) -> dict:
    """Fallback: return structured snippets when Claude is unavailable."""
    def snippets_list(results: list) -> list:
        return [
            f"{r.get('title', '')}: {r.get('body', '')[:150]}"
            for r in results[:5] if r.get("body")
        ]

    return {
        "process": f"Research gathered for {role} at {company}. Review the sources below for specifics.",
        "rounds": ["See interview data sources below"],
        "technical_focus": [f"Review {role} fundamentals", "System design", "Behavioral questions", "Company-specific tech stack"],
        "likely_questions": snippets_list(interview_results)[:6] or [f"No specific questions found for {company}"],
        "culture_notes": " ".join(r.get("body", "")[:150] for r in culture_results[:2]) or "No culture data found.",
        "salary_range": None,
        "questions_to_ask": [
            "What does the onboarding process look like?",
            "What are the biggest challenges the team is facing?",
            "How does the team measure success?",
            "What does growth look like in this role?",
        ],
        "prep_tips": [
            f"Research {company}'s recent product launches",
            "Review the job description for specific tech keywords",
            "Prepare 2-3 stories using the STAR method",
            "Check Glassdoor for recent interview experiences",
        ],
        "red_flags": None,
    }
