#!/usr/bin/env python3
"""
Message drafting tool using Claude.
Usage: python tools/draft_message.py --job-id 123 --type linkedin
       python tools/draft_message.py --job-id 123 --type email --email contact@company.com
"""

import asyncio
import argparse
import json
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.models.database import SessionLocal
from backend.models.job import Job
from backend.models.person import Person
from backend.models.user import User
from backend.services.claude_service import draft_linkedin_message, draft_email, suggest_talking_points


async def main():
    parser = argparse.ArgumentParser(description="Draft a personalized outreach message using Claude")
    parser.add_argument("--job-id", type=int, required=True, help="Job ID from the database")
    parser.add_argument("--type", choices=["linkedin", "email", "talking_points"], default="linkedin")
    parser.add_argument("--email", default=None, help="Recipient email (required for --type email)")
    parser.add_argument("--resume", default=None, help="Path to resume file for context")
    parser.add_argument("--name", default="Job Seeker", help="Your name")
    parser.add_argument("--output", default=None, help="Output file path (default: stdout)")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == args.job_id).first()
        if not job:
            print(f"Error: Job {args.job_id} not found.", file=sys.stderr)
            sys.exit(1)

        print(f"Job: {job.title or 'Unknown'} at {job.company or 'Unknown'}", file=sys.stderr)

        person = db.query(Person).filter(Person.job_id == args.job_id).first()
        person_info = person.to_dict() if person else {
            "name": job.poster_name or "Hiring Manager",
            "title": job.poster_title or "",
            "company": job.company or "",
            "bio": "",
            "skills": [],
            "recent_posts": [],
        }

        resume_text = ""
        if args.resume:
            resume_path = Path(args.resume)
            if resume_path.exists():
                from backend.services.resume_parser import parse_resume
                content = resume_path.read_bytes()
                parsed = await parse_resume(content, resume_path.name)
                resume_text = parsed.get("raw_text", "")
                print(f"Resume loaded: {len(resume_text)} characters", file=sys.stderr)

        if args.type == "linkedin":
            print("Generating LinkedIn DM...", file=sys.stderr)
            result = await draft_linkedin_message(
                job_info=job.to_dict(),
                person_info=person_info,
                resume_text=resume_text,
                user_name=args.name,
            )
            output = json.dumps({"type": "linkedin", "content": result}, indent=2)

        elif args.type == "email":
            if not args.email:
                print("Error: --email is required for email drafts.", file=sys.stderr)
                sys.exit(1)
            print("Generating email draft...", file=sys.stderr)
            result = await draft_email(
                job_info=job.to_dict(),
                person_info=person_info,
                resume_text=resume_text,
                user_name=args.name,
                email=args.email,
            )
            output = json.dumps({"type": "email", **result}, indent=2)

        elif args.type == "talking_points":
            print("Generating talking points...", file=sys.stderr)
            points = await suggest_talking_points(
                job_info=job.to_dict(),
                person_info=person_info,
                resume_text=resume_text,
            )
            output = json.dumps({"type": "talking_points", "points": points}, indent=2)

        print("Done.", file=sys.stderr)

        if args.output:
            with open(args.output, "w") as f:
                f.write(output)
            print(f"Saved to {args.output}", file=sys.stderr)
        else:
            print(output)

    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
