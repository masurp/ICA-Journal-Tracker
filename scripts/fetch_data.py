#!/usr/bin/env python3
"""
ICA Journal Tracker — Data Fetching Script
Fetches paper metadata from Crossref and Semantic Scholar.
Run locally or via GitHub Actions (weekly cron).
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

from journal_config import JOURNALS

# ── Config ──────────────────────────────────────────────────────────────────

MAILTO = os.environ.get("MAILTO", "")
HEADERS = {
    "User-Agent": f"ICA-Journal-Tracker/1.0 (https://github.com/masurp/ICA-Journal-Tracker; mailto:{MAILTO})"
}
DATA_DIR = Path(__file__).parent.parent / "data"
ROWS = 10       # fetch more than needed so we have room to deduplicate
TOP_N = 6       # papers shown per section
CROSSREF_BASE = "https://api.crossref.org/works"
S2_BASE = "https://api.semanticscholar.org/graph/v1/paper"
ALTMETRIC_BASE = "https://api.altmetric.com/v1/doi"

errors: list[str] = []


# ── Helpers ──────────────────────────────────────────────────────────────────

def get(url: str, params: dict | None = None, retries: int = 2, delay: float = 5.0) -> dict | None:
    for attempt in range(retries + 1):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=20)
            if r.status_code == 404:
                return None
            if r.status_code == 429:
                wait = int(r.headers.get("Retry-After", delay * 2))
                print(f"  Rate limited, waiting {wait}s…")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            if attempt < retries:
                time.sleep(delay)
            else:
                errors.append(f"GET {url}: {exc}")
                return None
    return None


def parse_crossref_paper(item: dict) -> dict:
    doi = item.get("DOI", "")
    title_parts = item.get("title", [])
    title = title_parts[0] if title_parts else "Untitled"

    authors_raw = item.get("author", [])
    authors = []
    for a in authors_raw[:10]:
        given = a.get("given", "")
        family = a.get("family", "")
        name = f"{given} {family}".strip() if given else family
        if name:
            authors.append(name)

    published = item.get("published", item.get("published-print", item.get("published-online", {})))
    date_parts = published.get("date-parts", [[None]])[0]
    year = date_parts[0] if date_parts else None

    citations = item.get("is-referenced-by-count", 0)

    return {
        "doi": doi,
        "title": title,
        "authors": authors,
        "year": year,
        "citation_count": citations,
        "altmetric_score": None,
        "topics": [],
        "url": f"https://doi.org/{doi}" if doi else "",
    }


# ── API Passes ────────────────────────────────────────────────────────────────

def fetch_crossref(issn: str, sort: str, from_date: str = "2000") -> list[dict]:
    data = get(CROSSREF_BASE, params={
        "filter": f"issn:{issn},from-pub-date:{from_date}",
        "sort": sort,
        "order": "desc",
        "rows": ROWS,
        "select": "DOI,title,author,published,published-print,published-online,is-referenced-by-count",
    })
    if not data:
        return []
    items = data.get("message", {}).get("items", [])
    return [parse_crossref_paper(item) for item in items]


def enrich_semantic_scholar(papers: list[dict]) -> None:
    """Mutates papers in-place, adding topic labels from Semantic Scholar."""
    seen: dict[str, list[str]] = {}
    for paper in papers:
        doi = paper["doi"]
        if doi in seen:
            paper["topics"] = seen[doi]
            continue
        data = get(f"{S2_BASE}/DOI:{doi}", params={"fields": "s2FieldsOfStudy"})
        time.sleep(1.1)
        if not data:
            seen[doi] = []
            continue
        fields = data.get("s2FieldsOfStudy", [])
        model_cats = [f["category"] for f in fields if f.get("source") == "s2-fos-model"]
        ext_cats = [f["category"] for f in fields if f.get("source") == "external"]
        topics = model_cats or ext_cats
        seen_topics: set[str] = set()
        unique_topics = []
        for t in topics:
            if t not in seen_topics:
                seen_topics.add(t)
                unique_topics.append(t)
        seen[doi] = unique_topics[:4]
        paper["topics"] = seen[doi]


def enrich_altmetric(papers: list[dict]) -> None:
    """Mutates papers in-place, adding Altmetric attention scores."""
    seen: dict[str, float | None] = {}
    for paper in papers:
        doi = paper["doi"]
        if doi in seen:
            paper["altmetric_score"] = seen[doi]
            continue
        data = get(f"{ALTMETRIC_BASE}/{doi}")
        time.sleep(1.5)
        if not data:
            seen[doi] = None
            paper["altmetric_score"] = None
            continue
        score = data.get("score")
        seen[doi] = round(score, 1) if score is not None else None
        paper["altmetric_score"] = seen[doi]


# ── Per-journal pipeline ──────────────────────────────────────────────────────

def deduplicate(papers: list[dict]) -> list[dict]:
    seen: set[str] = set()
    result = []
    for p in papers:
        key = p["doi"].lower()
        if key not in seen:
            seen.add(key)
            result.append(p)
    return result


def fetch_journal(journal: dict) -> dict:
    name = journal["name"]
    issn = journal["primary_issn"]
    print(f"\n{'─'*60}")
    print(f"  {name} ({issn})")
    print(f"{'─'*60}")

    # Trending window: papers published in the last 2 years
    trending_from = (datetime.now(timezone.utc) - timedelta(days=730)).strftime("%Y-%m-%d")

    print("  [1/4] Crossref — most cited (all time)…")
    cited = fetch_crossref(issn, sort="is-referenced-by-count")
    print(f"        {len(cited)} papers returned")

    print("  [1/4] Crossref — latest…")
    latest = fetch_crossref(issn, sort="published")
    print(f"        {len(latest)} papers returned")

    print(f"  [1/4] Crossref — trending (since {trending_from})…")
    trending = fetch_crossref(issn, sort="is-referenced-by-count", from_date=trending_from)
    print(f"        {len(trending)} papers returned")

    all_papers = deduplicate(cited + latest + trending)
    print(f"  Unique papers to enrich: {len(all_papers)}")

    print("  [2/4] Semantic Scholar — topic labels…")
    enrich_semantic_scholar(all_papers)

    print("  [3/4] Altmetric — attention scores…")
    enrich_altmetric(all_papers)

    doi_map = {p["doi"].lower(): p for p in all_papers}

    def enrich_list(papers: list[dict]) -> list[dict]:
        return [doi_map[p["doi"].lower()] for p in papers if p["doi"].lower() in doi_map]

    cited_enriched = enrich_list(cited)[:TOP_N]
    latest_enriched = enrich_list(latest)[:TOP_N]
    trending_enriched = enrich_list(trending)[:TOP_N]

    return {
        "journal_id": journal["id"],
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "trending_from": trending_from,
        "sections": {
            "most_cited": cited_enriched,
            "latest": latest_enriched,
            "trending": trending_enriched,
        },
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    DATA_DIR.mkdir(exist_ok=True)
    print(f"ICA Journal Tracker — Data Fetch")
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")
    print(f"Mailto: {MAILTO or '(not set — using anonymous Crossref pool)'}")
    print(f"Output: {DATA_DIR}")

    successes = []
    failures = []

    for journal in JOURNALS:
        try:
            result = fetch_journal(journal)
            out_path = DATA_DIR / f"{journal['id']}.json"
            out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False))
            total = sum(len(s) for s in result["sections"].values())
            print(f"  ✓ Wrote {out_path.name} ({total} total paper slots)")
            successes.append(journal["name"])
        except Exception as exc:
            failures.append(f"{journal['name']}: {exc}")
            print(f"  ✗ FAILED: {exc}")

    print(f"\n{'═'*60}")
    print(f"Done. {len(successes)} succeeded, {len(failures)} failed.")
    if failures:
        print("Failures:")
        for f in failures:
            print(f"  - {f}")
    if errors:
        print("API errors logged:")
        for e in errors:
            print(f"  - {e}")

    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
