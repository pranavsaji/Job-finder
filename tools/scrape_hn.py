#!/usr/bin/env python3
"""
Hacker News job scraper tool.
Usage: python tools/scrape_hn.py --month "March 2026"
       python tools/scrape_hn.py --roles "software engineer,machine learning" --days 30
"""

import asyncio
import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.services.hn_scraper import scrape_hn_jobs


async def main():
    parser = argparse.ArgumentParser(description="Scrape Hacker News for job posts")
    parser.add_argument("--roles", default="software engineer,developer", help="Comma-separated roles to search")
    parser.add_argument("--days", type=int, default=30, help="How many days back to search (default: 30)")
    parser.add_argument("--month", default=None, help="Month to search e.g. 'March 2026' (overrides --days)")
    parser.add_argument("--output", default=None, help="Output file path (default: stdout)")
    args = parser.parse_args()

    roles = [r.strip() for r in args.roles.split(",") if r.strip()]

    date_from = None
    if args.month:
        try:
            month_start = datetime.strptime(args.month, "%B %Y")
            date_from = month_start.replace(tzinfo=timezone.utc)
            print(f"Searching HN for month: {args.month}", file=sys.stderr)
        except ValueError:
            print(f"Invalid month format: {args.month}. Use 'March 2026'", file=sys.stderr)
            sys.exit(1)
    else:
        date_from = datetime.now(tz=timezone.utc) - timedelta(days=args.days)
        print(f"Searching HN for last {args.days} days", file=sys.stderr)

    print(f"Roles: {', '.join(roles)}", file=sys.stderr)

    jobs = await scrape_hn_jobs(roles=roles, date_from=date_from)

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
