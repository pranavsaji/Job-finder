#!/usr/bin/env python3
"""
LinkedIn job scraper tool.
Usage: python tools/scrape_linkedin.py --roles "software engineer,frontend developer" --days 7
"""

import asyncio
import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.services.linkedin_scraper import scrape_linkedin_jobs


async def main():
    parser = argparse.ArgumentParser(description="Scrape LinkedIn for job posts")
    parser.add_argument("--roles", required=True, help="Comma-separated list of roles to search")
    parser.add_argument("--days", type=int, default=7, help="How many days back to search (default: 7)")
    parser.add_argument("--output", default=None, help="Output file path (default: stdout)")
    args = parser.parse_args()

    roles = [r.strip() for r in args.roles.split(",") if r.strip()]
    if not roles:
        print("Error: No roles provided.", file=sys.stderr)
        sys.exit(1)

    date_from = datetime.now(tz=timezone.utc) - timedelta(days=args.days)

    print(f"Searching LinkedIn for: {', '.join(roles)}", file=sys.stderr)
    print(f"Date range: last {args.days} days", file=sys.stderr)

    jobs = await scrape_linkedin_jobs(roles=roles, date_from=date_from)

    print(f"Found {len(jobs)} jobs.", file=sys.stderr)

    output = json.dumps(jobs, indent=2, default=str)

    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"Results saved to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    asyncio.run(main())
