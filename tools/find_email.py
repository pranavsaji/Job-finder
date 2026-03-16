#!/usr/bin/env python3
"""
Email finder tool.
Usage: python tools/find_email.py --name "John Doe" --company "Acme Corp"
       python tools/find_email.py --name "Jane Smith" --domain "techcorp.io"
"""

import asyncio
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.services.email_service import find_email, get_domain_from_company


async def main():
    parser = argparse.ArgumentParser(description="Find email addresses for a person")
    parser.add_argument("--name", required=True, help="Full name of the person")
    parser.add_argument("--company", default=None, help="Company name (used to guess domain)")
    parser.add_argument("--domain", default=None, help="Known domain (e.g. company.com)")
    parser.add_argument("--hunter-key", default=None, help="Hunter.io API key (optional)")
    parser.add_argument("--output", default=None, help="Output file path (default: stdout)")
    args = parser.parse_args()

    domain = args.domain

    if not domain and args.company:
        print(f"Looking up domain for: {args.company}", file=sys.stderr)
        domain = await get_domain_from_company(args.company, hunter_api_key=args.hunter_key)
        if domain:
            print(f"Found domain: {domain}", file=sys.stderr)

    if not domain:
        print("Error: Could not determine domain. Provide --domain or --company.", file=sys.stderr)
        sys.exit(1)

    print(f"Searching for email: {args.name} @ {domain}", file=sys.stderr)

    result = await find_email(
        name=args.name,
        domain=domain,
        hunter_api_key=args.hunter_key,
    )

    if result["emails"]:
        print(f"\nFound {len(result['emails'])} possible email(s):", file=sys.stderr)
        for email_info in result["emails"]:
            confidence_label = "High" if email_info["confidence"] >= 80 else "Medium" if email_info["confidence"] >= 60 else "Low"
            print(f"  {email_info['email']} ({confidence_label} confidence, source: {email_info['source']})", file=sys.stderr)
        print(f"\nBest guess: {result['best_guess']}", file=sys.stderr)
    else:
        print("No emails found.", file=sys.stderr)

    output = json.dumps(result, indent=2)

    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"\nResults saved to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    asyncio.run(main())
