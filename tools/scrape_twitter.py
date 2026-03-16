#!/usr/bin/env python3
"""
Twitter/X job scraper tool.
Usage: python tools/scrape_twitter.py --roles "software engineer" --days 3
"""

import asyncio
import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.services.twitter_scraper import scrape_twitter_jobs


async def main():
    parser = argparse.ArgumentParser(description="Scrape Twitter/X for job posts")
    parser.add_argument("--roles", required=True, help="Comma-separated list of roles to search")
    parser.add_argument("--days", type=int, default=3, help="How many days back to search (default: 3)")
    parser.add_argument("--output", default=None, help="Output file path (default: stdout)")
    args = parser.parse_args()

    roles = [r.strip() for r in args.roles.split(",") if r.strip()]
    if not roles:
        print("Error: No roles provided.", file=sys.stderr)
        sys.exit(1)

    date_from = datetime.now(tz=timezone.utc) - timedelta(days=args.days)

    print(f"Searching Twitter/X for: {', '.join(roles)}", file=sys.stderr)
    print(f"Date range: last {args.days} days", file=sys.stderr)

    jobs = await scrape_twitter_jobs(roles=roles, date_from=date_from)

    print(f"Found {len(jobs)} posts.", file=sys.stderr)

    output = json.dumps(jobs, indent=2, default=str)

    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"Results saved to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    asyncio.run(main())
