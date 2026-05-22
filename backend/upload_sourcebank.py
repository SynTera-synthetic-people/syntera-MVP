"""
Bulk Sourcebank uploader — reads Excel and registers each URL via the API.

Usage:
    python upload_sourcebank.py \
        --file   "C:/path/to/B2B_Cleaned.xlsx" \
        --host   "https://your-staging-url.com" \
        --token  "eyJhbGci..."

Optional:
    --dry-run        Print what would be sent, don't actually call the API
    --delay  2.0     Seconds between requests (default 2s)
    --start  0       Skip first N rows (for resuming)
"""

import argparse
import json
import re
import sys
import time
import urllib.request
import urllib.error
import urllib.parse

try:
    import pandas as pd
except ImportError:
    print("ERROR: pandas not installed. Run: pip install pandas openpyxl")
    sys.exit(1)


# ── Sector → source_group mapping ────────────────────────────────────────────

SECTOR_GROUP = {
    "Information Technology":          "b2b_technology",
    "Manufacturing & Industrial":      "b2b_manufacturing",
    "Financial Services":              "b2b_finance",
    "Transportation, Logistics & Mob": "b2b_logistics",
    "Energy, Utilities & Environment": "b2b_energy",
    "Construction & Real Estate":      "b2b_real_estate",
    "Healthcare & Life Sciences":      "b2b_healthcare",
    "Consumer Goods & Retail":         "b2b_consumer",
    "Agriculture & Natural Resources": "b2b_agriculture",
    "Hospitality & Tourism":           "b2b_hospitality",
    "Education, Media & Professional": "b2b_education",
    "Government Defense & Public Sec": "b2b_government",
}


def _extract_keywords(tags_normalized: str, max_tags: int = 8) -> str:
    """
    'global [geographic], ai_adoption [technology_trend], ...'
    → 'global,ai_adoption,digital_transformation,...'
    """
    if not tags_normalized or not isinstance(tags_normalized, str):
        return ""
    tags = re.findall(r"([a-z0-9_&\-]+)\s*\[", tags_normalized.lower())
    return ",".join(tags[:max_tags])


def _build_title(row) -> str:
    parts = [
        str(row.get("Company/Agency") or "").strip(),
        str(row.get("Theme") or "").strip(),
        str(row.get("Target Geo") or "").strip(),
    ]
    return " | ".join(p for p in parts if p) or "Untitled"


def _register_url(host: str, token: str, payload: dict) -> dict:
    """POST /syncdb/source/url as multipart/form-data."""
    boundary = "----BoundaryXYZ1234"
    body_parts = []
    for key, value in payload.items():
        if value is None:
            continue
        body_parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'
        )
    body_parts.append(f"--{boundary}--\r\n")
    body = "".join(body_parts).encode("utf-8")

    url = f"{host.rstrip('/')}/syncdb/source/url"
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return {"status": resp.status, "body": json.loads(resp.read())}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "body": e.read().decode("utf-8", errors="replace")}
    except Exception as e:
        return {"status": 0, "body": str(e)}


def run(file: str, host: str, token: str, dry_run: bool, delay: float, start: int):
    df = pd.read_excel(file)
    df = df[df["URL Valid"].astype(str).str.strip().str.lower() == "yes"].reset_index(drop=True)
    total = len(df)
    print(f"\nLoaded {total} valid URLs from {file}")
    print(f"Host: {host}")
    print(f"Dry run: {dry_run}")
    print(f"Starting from row: {start}")
    print("=" * 60)

    success, failed = 0, 0
    errors = []

    for i, row in df.iterrows():
        if i < start:
            continue

        url = str(row.get("Source Link") or "").strip()
        if not url:
            print(f"[{i+1}/{total}] SKIP — empty URL")
            continue

        title       = _build_title(row)
        source_group = SECTOR_GROUP.get(str(row.get("Sector") or "").strip(), "b2b_general")
        keywords    = _extract_keywords(str(row.get("Tags (Normalized)") or ""))

        payload = {
            "url":          url,
            "title":        title,
            "source_group": source_group,
            "keywords":     keywords,
            # domain, authority_tier, approval_status, allowed_use → auto-classify
        }

        print(f"[{i+1}/{total}] {title[:60]}")
        print(f"         URL:   {url[:70]}")
        print(f"         Group: {source_group} | Keywords: {keywords[:50]}")

        if dry_run:
            print("         [DRY RUN — not sent]\n")
            success += 1
            continue

        result = _register_url(host, token, payload)
        status = result["status"]

        if 200 <= status < 300:
            doc_id = result["body"].get("id", "?") if isinstance(result["body"], dict) else "?"
            print(f"         ✅ OK (id={doc_id})\n")
            success += 1
        else:
            print(f"         ❌ FAILED {status}: {str(result['body'])[:100]}\n")
            failed += 1
            errors.append({"row": i + 1, "url": url, "status": status, "error": str(result["body"])[:200]})

        if delay > 0:
            time.sleep(delay)

    print("=" * 60)
    print(f"Done. ✅ Success: {success}  ❌ Failed: {failed}")
    if errors:
        print("\nFailed rows:")
        for e in errors:
            print(f"  Row {e['row']}: [{e['status']}] {e['url']}")
            print(f"    {e['error']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk upload source URLs to Sourcebank")
    parser.add_argument("--file",    required=True,  help="Path to Excel file")
    parser.add_argument("--host",    required=True,  help="Backend URL e.g. https://staging.example.com")
    parser.add_argument("--token",   required=True,  help="JWT Bearer token")
    parser.add_argument("--dry-run", action="store_true", help="Print payloads without sending")
    parser.add_argument("--delay",   type=float, default=2.0, help="Seconds between requests (default 2)")
    parser.add_argument("--start",   type=int,   default=0,   help="Skip first N rows (resume from row N)")
    args = parser.parse_args()

    run(
        file=args.file,
        host=args.host,
        token=args.token,
        dry_run=args.dry_run,
        delay=args.delay,
        start=args.start,
    )
