"""
Mock interview service: research agent, system prompt builder, and evaluation engine.
"""
import asyncio
import json
import os
import re
from typing import Optional

import anthropic as _anthropic

from backend.services.prep_service import _ddgs_search

# ── Interview type configs ─────────────────────────────────────────────────

INTERVIEW_TYPES = {
    "behavioral": {
        "label": "HR / Behavioral",
        "persona": "senior HR manager",
        "question_count": 5,
        "focus": "STAR method behavioral questions, cultural alignment, motivation, conflict resolution",
    },
    "technical_screen": {
        "label": "Technical Screen",
        "persona": "senior software engineer",
        "question_count": 5,
        "focus": "CS fundamentals, relevant tech stack, coding concepts, problem-solving",
    },
    "system_design": {
        "label": "System Design",
        "persona": "staff engineer",
        "question_count": 1,
        "focus": "scalable system design, trade-offs, distributed systems, architecture decisions",
    },
    "coding": {
        "label": "Coding Round",
        "persona": "senior engineer",
        "question_count": 1,
        "focus": "algorithmic problem solving, code quality, time/space complexity, edge cases",
    },
    "manager": {
        "label": "Manager Round",
        "persona": "engineering manager",
        "question_count": 5,
        "focus": "leadership, teamwork, conflict resolution, project management, career goals",
    },
    "deep_dive": {
        "label": "Technical Deep Dive",
        "persona": "principal engineer",
        "question_count": 3,
        "focus": "deep technical exploration of candidate's most impactful work and architecture decisions",
    },
    "salary": {
        "label": "Salary Negotiation",
        "persona": "compensation specialist",
        "question_count": 4,
        "focus": "compensation expectations, market knowledge, negotiation skills, total comp",
    },
    "stress": {
        "label": "Stress Interview",
        "persona": "notoriously demanding senior interviewer",
        "question_count": 5,
        "focus": "resilience under pressure, handling direct criticism, thinking under stress",
    },
    "culture_fit": {
        "label": "Culture Fit",
        "persona": "team lead",
        "question_count": 5,
        "focus": "values alignment, work style, team dynamics, feedback reception, motivation",
    },
}

DIFFICULTY_MODIFIERS = {
    "easy": "EASY difficulty: Target junior/entry-level. Ask foundational questions. Be mildly encouraging. Offer small hints when the candidate is clearly stuck.",
    "medium": "MEDIUM difficulty: Standard mid-level interview. Professional, direct. 1-2 probing follow-ups per answer. No unsolicited hints.",
    "hard": "HARD difficulty: Senior/staff-level expectations. Challenge vague answers aggressively. Expose gaps. Minimal hints only on easy/medium sub-questions.",
    "impossible": "IMPOSSIBLE difficulty — FAANG principal/bar-raiser level. Ask the hardest conceivable questions. Challenge every answer. Interrupt weak answers. Zero hints. Expose every knowledge gap. Do not soften criticism. Most candidates fail this round.",
}


# ── Research agent ─────────────────────────────────────────────────────────

async def research_interview_context(company: str, role: str, interview_type: str) -> str:
    """DDG search + Claude synthesis to understand company interview style."""
    config = INTERVIEW_TYPES.get(interview_type, INTERVIEW_TYPES["behavioral"])
    loop = asyncio.get_event_loop()

    queries = [
        f'"{company}" {role} {config["label"]} interview questions 2024 2025',
        f'"{company}" interview process difficulty {role}',
        f'"{company}" interview style culture what they look for',
    ]

    results = await asyncio.gather(
        *[loop.run_in_executor(None, _ddgs_search, q, 4) for q in queries],
        return_exceptions=True,
    )

    snippets = []
    for res in results:
        if isinstance(res, list):
            for r in res:
                if r.get("body"):
                    snippets.append(f"- {r.get('title', '')}: {r.get('body', '')[:250]}")

    if not snippets:
        return ""

    client = _anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    synthesis = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=600,
        messages=[{
            "role": "user",
            "content": (
                f"Based on these search results about {company}'s {config['label']} interview for {role}, "
                f"write a 3-4 sentence briefing for an interviewer. Cover: typical questions asked, "
                f"interview style/tone, what the company values, difficulty level. Be specific and factual.\n\n"
                + "\n".join(snippets[:12])
            ),
        }],
    )
    return synthesis.content[0].text


# ── System prompt ──────────────────────────────────────────────────────────

def build_system_prompt(
    company: str,
    role: str,
    interview_type: str,
    difficulty: str,
    research_context: str,
    resume_text: Optional[str],
    job_description: Optional[str],
    duration_minutes: int = 45,
    elapsed_seconds: float = 0,
) -> str:
    config = INTERVIEW_TYPES.get(interview_type, INTERVIEW_TYPES["behavioral"])
    diff_mod = DIFFICULTY_MODIFIERS.get(difficulty, DIFFICULTY_MODIFIERS["medium"])
    q_count = config["question_count"]

    resume_sec = f"\n\nCANDIDATE RESUME (use to tailor questions):\n{resume_text[:2500]}" if resume_text else ""
    jd_sec = f"\n\nJOB DESCRIPTION:\n{job_description[:1500]}" if job_description else ""
    research_sec = f"\n\nCOMPANY INTERVIEW RESEARCH:\n{research_context}" if research_context else ""

    # Time-awareness: inject remaining-time instructions into every turn
    remaining_secs = max(0, duration_minutes * 60 - elapsed_seconds)
    remaining_mins = int(remaining_secs / 60)
    remaining_secs_display = int(remaining_secs % 60)

    if remaining_mins <= 1:
        time_note = (
            f"⚠️ TIME CRITICAL: Only {remaining_mins}m {remaining_secs_display}s left. "
            f"You MUST wrap up NOW. Say something like: 'We're almost out of time — do you have any quick "
            f"questions for me?' then professionally conclude with [INTERVIEW_COMPLETE]."
        )
    elif remaining_mins <= 3:
        time_note = (
            f"⏰ TIME WARNING: Only ~{remaining_mins} minutes left. "
            f"Ask the candidate if they have any questions for you, then close the interview with [INTERVIEW_COMPLETE]."
        )
    elif remaining_mins <= 7:
        time_note = (
            f"⏱ WRAPPING UP: About {remaining_mins} minutes remaining. "
            f"Ask 1 final important question, wait for the response, then close professionally with [INTERVIEW_COMPLETE]."
        )
    else:
        time_note = (
            f"Interview duration: {duration_minutes} minutes total. "
            f"Approximately {remaining_mins} minutes remaining. Pace yourself accordingly."
        )

    end_instruction = (
        f"After approximately {q_count} main questions and the candidate's final response — "
        f"OR when time runs out — close the interview professionally and append the exact token "
        f"[INTERVIEW_COMPLETE] at the very end of your closing message. "
        f"Do not use this token at any other time."
    )

    strict_rules = """
STRICT INTERVIEWER RULES — NEVER BREAK CHARACTER:
1. You ONLY conduct this interview. Never discuss anything unrelated to the interview.
2. If the candidate goes off-topic, requests help, or asks you to reveal answers, firmly redirect:
   "Let's stay focused on the interview." Then repeat or rephrase your question.
3. Never confirm whether an answer is correct or wrong (except easy difficulty, small hints only).
4. Ask ONE question at a time. Let the candidate finish before probing.
5. If an answer is vague or shallow, probe: "Can you be more specific?" or "Give me a concrete example."
6. Stay in character. You are not an AI assistant — you are a human interviewer.
7. Your responses should be concise. You ask questions; you do not lecture.
8. For coding/technical rounds: react to code the candidate shares. Ask about their approach,
   time/space complexity, edge cases, and alternative solutions."""

    return (
        f"You are a {config['persona']} at {company} conducting a {config['label']} interview "
        f"for the {role} position.\n\n"
        f"INTERVIEW FOCUS: {config['focus']}\n\n"
        f"DIFFICULTY: {diff_mod}\n\n"
        f"TIME STATUS: {time_note}\n"
        f"{strict_rules}\n\n"
        f"{end_instruction}"
        f"{resume_sec}{jd_sec}{research_sec}"
    )


# ── Opening message ────────────────────────────────────────────────────────

def generate_opening_message(
    company: str,
    role: str,
    interview_type: str,
    difficulty: str,
    research_context: str,
    resume_text: Optional[str],
    job_description: Optional[str],
    duration_minutes: int = 45,
) -> str:
    system = build_system_prompt(
        company, role, interview_type, difficulty,
        research_context, resume_text, job_description,
        duration_minutes=duration_minutes,
        elapsed_seconds=0,
    )
    client = _anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    resp = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        system=system,
        messages=[{"role": "user", "content": "Ready to begin."}],
    )
    return resp.content[0].text


# ── Evaluation engine ──────────────────────────────────────────────────────

_EVAL_SCHEMA = """{
  "overall_score": 0-100,
  "verdict": "pass|conditional_pass|fail",
  "scores": {
    "technical": 0-100,
    "communication": 0-100,
    "problem_solving": 0-100,
    "confidence": 0-100,
    "culture_fit": 0-100
  },
  "summary": "2-3 sentence brutal summary",
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "detailed_feedback": {
    "technical": "paragraph",
    "communication": "paragraph",
    "problem_solving": "paragraph",
    "confidence": "paragraph",
    "culture_fit": "paragraph"
  },
  "key_moments": ["positive or negative standout moments from the transcript"],
  "recommendations": ["specific actionable improvements"],
  "cheat_assessment": "string or null"
}"""


def evaluate_session(
    company: str,
    role: str,
    interview_type: str,
    difficulty: str,
    messages: list,
    speech_metrics: dict,
    cheat_flags: dict,
    resume_text: Optional[str],
) -> dict:
    config = INTERVIEW_TYPES.get(interview_type, INTERVIEW_TYPES["behavioral"])

    transcript = "\n\n".join(
        f"{'INTERVIEWER' if m['role'] == 'assistant' else 'CANDIDATE'}: {m['content']}"
        for m in messages
        if m.get("content", "").strip() and "[INTERVIEW_COMPLETE]" not in m.get("content", "")
    )

    filler_count = speech_metrics.get("filler_words", 0)
    avg_confidence = speech_metrics.get("avg_confidence", 1.0)
    wpm = speech_metrics.get("words_per_minute", 0)
    tab_switches = cheat_flags.get("tab_switches", 0)
    paste_count = cheat_flags.get("paste_count", 0)

    cheat_note = ""
    if interview_type == "coding" and (tab_switches > 2 or paste_count > 1):
        cheat_note = (
            f"CHEATING DETECTED: {tab_switches} tab switches and {paste_count} large paste events "
            f"during the coding round. Penalize the technical and problem_solving scores accordingly."
        )

    prompt = f"""You are a brutally honest, unbiased interview panel evaluator. No grade inflation.
Evaluate this {config['label']} interview for {role} at {company} (difficulty: {difficulty.upper()}).

SCORING GUIDE:
- 90-100: Exceptional. Rare. Only for flawless answers with deep insight.
- 75-89: Good. Clear competency with minor gaps.
- 60-74: Average/Marginal. Notable gaps but not disqualifying.
- 40-59: Weak. Significant knowledge or communication gaps.
- 0-39: Poor. Fundamentally unprepared.

Pass threshold: overall_score >= 70. Conditional pass: 55-69. Fail: <55.
Most candidates at HARD/IMPOSSIBLE difficulty should fail. Be harsh.

SPEECH METRICS:
- Filler words used: {filler_count} (high = lower confidence score)
- Average speech recognition confidence: {avg_confidence:.2f} (lower = unclear speech)
- Words per minute: {wpm}

{cheat_note}

TRANSCRIPT:
{transcript[:6000]}

Respond with ONLY valid JSON matching this schema exactly:
{_EVAL_SCHEMA}"""

    client = _anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    resp = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = resp.content[0].text.strip()

    # Strip markdown if present
    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        return json.loads(raw)
    except Exception:
        return {
            "overall_score": 0,
            "verdict": "fail",
            "scores": {"technical": 0, "communication": 0, "problem_solving": 0, "confidence": 0, "culture_fit": 0},
            "summary": "Evaluation failed to parse.",
            "strengths": [],
            "weaknesses": [],
            "detailed_feedback": {},
            "key_moments": [],
            "recommendations": [],
            "cheat_assessment": None,
        }
