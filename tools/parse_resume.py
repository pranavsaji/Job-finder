#!/usr/bin/env python3
"""
Resume parser tool.
Usage: python tools/parse_resume.py --file resume.pdf
       python tools/parse_resume.py --file resume.docx --output parsed.json
"""

import asyncio
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.services.resume_parser import parse_resume


async def main():
    parser = argparse.ArgumentParser(description="Parse a resume file")
    parser.add_argument("--file", required=True, help="Path to resume file (PDF, DOCX, TXT)")
    parser.add_argument("--output", default=None, help="Output file path (default: stdout)")
    args = parser.parse_args()

    file_path = Path(args.file)
    if not file_path.exists():
        print(f"Error: File not found: {args.file}", file=sys.stderr)
        sys.exit(1)

    content = file_path.read_bytes()
    print(f"Parsing {file_path.name} ({len(content):,} bytes)...", file=sys.stderr)

    result = await parse_resume(content, file_path.name)

    print(f"\nExtracted {len(result['raw_text'])} characters", file=sys.stderr)
    if result.get("name"):
        print(f"Name: {result['name']}", file=sys.stderr)
    if result.get("skills"):
        print(f"Skills found: {', '.join(result['skills'][:10])}", file=sys.stderr)

    output_data = {
        "filename": file_path.name,
        "name": result.get("name"),
        "skills": result.get("skills", []),
        "experience": result.get("experience", []),
        "education": result.get("education", []),
        "character_count": len(result["raw_text"]),
        "preview": result["raw_text"][:500],
    }

    output = json.dumps(output_data, indent=2)

    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"\nResults saved to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    asyncio.run(main())
