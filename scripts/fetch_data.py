#!/usr/bin/env python3
"""
ICA Journal Tracker — Data Fetching Script
Fetches paper metadata from OpenAlex; enriches with LLM-generated topic keywords.
Run locally or via GitHub Actions (weekly cron).

Usage:
  python3 fetch_data.py                  # fetch all journals
  python3 fetch_data.py --journal jcmc   # fetch one journal by id
  python3 fetch_data.py --force          # ignore the topic cache, re-tag every fetched paper
"""

import argparse
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import anthropic
import requests

from build_feeds import write_feeds
from journal_config import JOURNALS

# ── Config ──────────────────────────────────────────────────────────────────

MAILTO = os.environ.get("MAILTO", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
HEADERS = {
    "User-Agent": f"ICA-Journal-Tracker/1.0 (https://github.com/masurp/ICA-Journal-Tracker; mailto:{MAILTO})"
}
DATA_DIR = Path(__file__).parent.parent / "data"
TOPIC_CACHE_PATH = DATA_DIR / "topic_cache.json"
ROWS = 50       # papers fetched per section
TOP_N = 50      # papers stored per section
OPENALEX_BASE = "https://api.openalex.org/works"
OPENALEX_SELECT = "doi,title,authorships,publication_date,cited_by_count,abstract_inverted_index"

# Trending: papers from the last 2 years, ranked by smoothed citations per month
TRENDING_DAYS = 730
TRENDING_MIN_CITATIONS = 2
TRENDING_SMOOTHING_MONTHS = 6   # damps very young papers that have only a handful of citations
TRENDING_PAGE_SIZE = 200
TRENDING_MAX_PAGES = 5

LLM_MODEL = "claude-haiku-5-5"
LLM_WORKERS = 4
VOCAB_SIZE = 200        # most frequent existing topics offered to the LLM for reuse
VOCAB_MIN_COUNT = 3

errors: list[str] = []


# ── Previous data & topic cache ──────────────────────────────────────────────

def load_previous(journal_id: str) -> dict:
    """Last written JSON for a journal, used as fallback when OpenAlex fails."""
    path = DATA_DIR / f"{journal_id}.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def load_topic_cache() -> dict[str, list[str]]:
    """LLM topics keyed by lowercase DOI. Seeded from the journal JSONs on first run."""
    if TOPIC_CACHE_PATH.exists():
        return json.loads(TOPIC_CACHE_PATH.read_text())
    cache: dict[str, list[str]] = {}
    for journal in JOURNALS:
        for section in load_previous(journal["id"]).get("sections", {}).values():
            for paper in section:
                doi = paper.get("doi", "").lower()
                if doi and paper.get("topics") and paper.get("topics_llm"):
                    cache[doi] = paper["topics"]
    return cache


def save_topic_cache(cache: dict[str, list[str]]) -> None:
    # One DOI per line keeps the weekly diffs small
    lines = [f"  {json.dumps(doi)}: {json.dumps(cache[doi], ensure_ascii=False)}" for doi in sorted(cache)]
    TOPIC_CACHE_PATH.write_text("{\n" + ",\n".join(lines) + "\n}\n")


# ── Topic normalization ──────────────────────────────────────────────────────

def topic_key(topic: str) -> str:
    """Spelling-insensitive key, so 'Agenda-Setting' and 'agenda setting' collide."""
    text = re.sub(r"[^\w\s]", " ", topic.lower().replace("&", " and "))
    return " ".join(text.split())


def build_canonical_forms(cache: dict[str, list[str]]) -> dict[str, str]:
    """Most common spelling per topic key, used as the display form."""
    forms: dict[str, Counter] = defaultdict(Counter)
    for topics in cache.values():
        for topic in topics:
            forms[topic_key(topic)][topic.strip()] += 1
    return {key: counter.most_common(1)[0][0] for key, counter in forms.items()}


def canonicalize(topics: list[str], canonical: dict[str, str]) -> list[str]:
    result, seen = [], set()
    for topic in topics:
        key = topic_key(topic)
        if key and key not in seen:
            seen.add(key)
            result.append(canonical.get(key, topic.strip()))
    return result


def build_vocabulary(cache: dict[str, list[str]], canonical: dict[str, str]) -> list[str]:
    counts = Counter(key for topics in cache.values() for key in {topic_key(t) for t in topics})
    common = [key for key, n in counts.most_common(VOCAB_SIZE) if n >= VOCAB_MIN_COUNT]
    return sorted((canonical[key] for key in common), key=str.lower)


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


def reconstruct_abstract(inverted_index: dict | None) -> str:
    """Reconstruct plain text from OpenAlex's inverted index abstract format."""
    if not inverted_index:
        return ""
    pairs = [(pos, word) for word, positions in inverted_index.items() for pos in positions]
    pairs.sort()
    return " ".join(word for _, word in pairs)


def parse_openalex_paper(item: dict) -> dict:
    raw_doi = item.get("doi", "")
    # OpenAlex returns full URL: "https://doi.org/10.xxxx/..."
    doi = raw_doi.replace("https://doi.org/", "") if raw_doi else ""

    title = item.get("title") or "Untitled"

    authorships = item.get("authorships", [])
    authors = []
    for a in authorships[:10]:
        name = a.get("author", {}).get("display_name", "")
        if name:
            authors.append(name)

    pub_date = item.get("publication_date") or ""
    year = int(pub_date[:4]) if len(pub_date) >= 4 else None

    citations = item.get("cited_by_count", 0)

    abstract = reconstruct_abstract(item.get("abstract_inverted_index"))

    return {
        "doi": doi,
        "title": title,
        "authors": authors,
        "year": year,
        "publication_date": pub_date or None,
        "citation_count": citations,
        "topics": [],
        "abstract": abstract,
        "url": f"https://doi.org/{doi}" if doi else "",
    }


def trend_score(paper: dict, today: date) -> float:
    """Citations per month since publication, smoothed so brand-new papers don't dominate."""
    try:
        published = date.fromisoformat(paper["publication_date"])
    except (KeyError, TypeError, ValueError):
        return 0.0
    months = max((today - published).days, 0) / 30.44
    return round(paper["citation_count"] / (months + TRENDING_SMOOTHING_MONTHS), 3)


# ── API Passes ────────────────────────────────────────────────────────────────

def fetch_openalex(
    issn: str,
    sort: str,
    from_date: str | None = None,
    min_citations: int | None = None,
    per_page: int = ROWS,
    max_pages: int = 1,
) -> list[dict] | None:
    """Returns None when OpenAlex can't be reached, so the caller can keep the previous snapshot."""
    # has_doi: DOI-less records are mostly book reviews credited with the reviewed book's citations
    filter_parts = [f"primary_location.source.issn:{issn}", "type:article", "has_doi:true"]
    if from_date:
        filter_parts.append(f"from_publication_date:{from_date}")
    if min_citations is not None:
        filter_parts.append(f"cited_by_count:>{min_citations - 1}")

    params = {
        "filter": ",".join(filter_parts),
        "sort": sort,
        "per-page": per_page,
        "select": OPENALEX_SELECT,
        "mailto": MAILTO,
        "cursor": "*",
    }
    items: list[dict] = []
    for _ in range(max_pages):
        data = get(OPENALEX_BASE, params=params)
        if data is None:
            return None
        items.extend(data.get("results", []))
        next_cursor = (data.get("meta") or {}).get("next_cursor")
        if not next_cursor or not data.get("results"):
            break
        params["cursor"] = next_cursor

    papers = [parse_openalex_paper(item) for item in items]
    # Drop non-article entries (TOC pages, editorials misclassified by OpenAlex)
    return [p for p in papers if p["doi"] and p["authors"] and "Get access" not in p["abstract"]]


# ── LLM enrichment ───────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You assign topic keywords to communication science papers for a research dashboard. \
The keywords are counted and compared across journals and years, so consistent wording matters more than nuance.

Return 3-4 keywords per paper:
- Each keyword names a research topic, theory, method, platform, or phenomenon in 1-4 words.
- Whenever a term from the vocabulary below fits the paper, use it with its exact spelling. \
Add a new term only for a central topic the vocabulary does not cover.
- Use sentence case: capitalize only the first word and proper nouns (e.g. "Political polarization", "TikTok").
- Keep new terms general enough to recur across papers: "Misinformation", not "Vaccine misinformation on Facebook".

Vocabulary:
"""

TOPIC_SCHEMA = {
    "type": "object",
    "properties": {"topics": {"type": "array", "items": {"type": "string"}}},
    "required": ["topics"],
    "additionalProperties": False,
}


def tag_paper(client: anthropic.Anthropic, system: str, paper: dict) -> list[str] | None:
    content = f"Title: {paper['title']}"
    if paper.get("abstract"):
        content += f"\nAbstract: {paper['abstract'][:1500]}"
    try:
        msg = client.messages.create(
            model=LLM_MODEL,
            max_tokens=200,
            thinking={"type": "disabled"},
            output_config={
                "effort": "low",
                "format": {"type": "json_schema", "schema": TOPIC_SCHEMA},
            },
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": content}],
        )
        if msg.stop_reason == "refusal":
            errors.append(f"LLM declined {paper['doi']}")
            return None
        text = next(b.text for b in msg.content if b.type == "text")
        topics = json.loads(text)["topics"]
        return [t.strip() for t in topics if isinstance(t, str) and t.strip()][:4]
    except Exception as exc:
        errors.append(f"LLM enrichment for {paper['doi']}: {exc}")
        return None


def enrich_with_llm(papers: list[dict], cache: dict[str, list[str]], vocabulary: list[str], force: bool) -> None:
    """Sets topics on papers from the cache, tagging uncached papers via Claude Haiku first.
    New tags are written into the cache; failed calls leave any existing entry untouched."""
    todo = [p for p in papers if force or p["doi"].lower() not in cache]
    print(f"  Unique papers: {len(papers)} ({len(papers) - len(todo)} cached, {len(todo)} to tag)")
    if todo and not ANTHROPIC_API_KEY:
        print("  WARNING: ANTHROPIC_API_KEY not set — LLM calls skipped, cache still applied")
        todo = []

    if todo:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY, max_retries=5)
        system = SYSTEM_PROMPT + "\n".join(vocabulary)
        with ThreadPoolExecutor(LLM_WORKERS) as pool:
            for paper, topics in zip(todo, pool.map(lambda p: tag_paper(client, system, p), todo)):
                if topics:
                    cache[paper["doi"].lower()] = topics

    for paper in papers:
        paper["topics"] = list(cache.get(paper["doi"].lower(), []))


# ── Per-journal pipeline ──────────────────────────────────────────────────────

def deduplicate(papers: list[dict]) -> list[dict]:
    seen: set[str] = set()
    result = []
    for p in papers:
        key = p.get("doi", "").lower()
        if key and key not in seen:
            seen.add(key)
            result.append(p)
    return result


def describe(papers: list[dict] | None) -> str:
    return "FAILED — keeping previous snapshot" if papers is None else f"{len(papers)} papers returned"


def fetch_journal(journal: dict, cache: dict[str, list[str]], vocabulary: list[str], force: bool) -> dict:
    name = journal["name"]
    issn = journal["primary_issn"]
    print(f"\n{'─'*60}")
    print(f"  {name} ({issn})")
    print(f"{'─'*60}")

    previous = load_previous(journal["id"])
    today = datetime.now(timezone.utc).date()
    trending_from = (today - timedelta(days=TRENDING_DAYS)).isoformat()

    print("  [1/4] OpenAlex — most cited (all time)…")
    cited = fetch_openalex(issn, sort="cited_by_count:desc")
    print(f"        {describe(cited)}")

    print("  [2/4] OpenAlex — latest…")
    latest = fetch_openalex(issn, sort="publication_date:desc")
    print(f"        {describe(latest)}")

    print(f"  [3/4] OpenAlex — trending (since {trending_from})…")
    trending = fetch_openalex(
        issn, sort="cited_by_count:desc", from_date=trending_from, min_citations=TRENDING_MIN_CITATIONS,
        per_page=TRENDING_PAGE_SIZE, max_pages=TRENDING_MAX_PAGES,
    )
    print(f"        {describe(trending)}")
    if trending is not None:
        trending.sort(key=lambda p: trend_score(p, today), reverse=True)

    fetched = {"most_cited": cited, "latest": latest, "trending": trending}
    if all(papers is None for papers in fetched.values()):
        raise RuntimeError("OpenAlex unreachable — previous file left untouched")
    sections = {}
    for key, papers in fetched.items():
        if papers is None:
            errors.append(f"{name}: {key} fetch failed — kept previous snapshot")
            papers = previous.get("sections", {}).get(key, [])
        sections[key] = papers[:TOP_N]
    if trending is None:
        trending_from = previous.get("trending_from", trending_from)

    all_papers = deduplicate(sections["most_cited"] + sections["latest"] + sections["trending"])
    doi_map = {p["doi"].lower(): p for p in all_papers}

    def resolve(papers: list[dict]) -> list[dict]:
        return [doi_map[p["doi"].lower()] for p in papers if p.get("doi", "").lower() in doi_map]

    sections = {key: resolve(papers) for key, papers in sections.items()}
    for paper in sections["trending"]:
        paper["trend_score"] = trend_score(paper, today)

    print("  [4/4] Claude Haiku — topic keywords…")
    enrich_with_llm(all_papers, cache, vocabulary, force)
    for paper in all_papers:
        paper.pop("topics_llm", None)  # legacy field from snapshots written before the topic cache

    return {
        "journal_id": journal["id"],
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "trending_from": trending_from,
        "sections": sections,
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ICA Journal Tracker — Data Fetch")
    parser.add_argument(
        "--journal", metavar="ID",
        help="Fetch only this journal id (e.g. jcmc, communication_research). "
             "Can be specified multiple times.",
        action="append", dest="journals",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Ignore the topic cache — re-tag every fetched paper with Claude.",
    )
    args = parser.parse_args()

    DATA_DIR.mkdir(exist_ok=True)
    print(f"ICA Journal Tracker — Data Fetch")
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")
    print(f"Mailto: {MAILTO or '(not set — using anonymous OpenAlex pool)'}")
    print(f"Output: {DATA_DIR}")
    if args.force:
        print("Mode: --force (topic cache ignored, all fetched papers re-tagged via LLM)")

    # Filter journals if --journal was given
    journals = JOURNALS
    if args.journals:
        ids = set(args.journals)
        journals = [j for j in JOURNALS if j["id"] in ids]
        unknown = ids - {j["id"] for j in journals}
        if unknown:
            print(f"WARNING: unknown journal id(s): {', '.join(sorted(unknown))}")
            print(f"Valid ids: {', '.join(j['id'] for j in JOURNALS)}")
        if not journals:
            sys.exit(1)

    cache = load_topic_cache()
    vocabulary = build_vocabulary(cache, build_canonical_forms(cache))
    print(f"Topic cache: {len(cache)} papers, vocabulary: {len(vocabulary)} terms")

    results = {}
    failures = []
    try:
        for journal in journals:
            try:
                results[journal["id"]] = fetch_journal(journal, cache, vocabulary, args.force)
            except Exception as exc:
                failures.append(f"{journal['name']}: {exc}")
                print(f"  ✗ FAILED: {exc}")
    finally:
        save_topic_cache(cache)

    # Unify topic spellings across all journals using the updated cache, then write
    print(f"\n{'═'*60}")
    canonical = build_canonical_forms(cache)
    for journal_id, result in results.items():
        seen: set[int] = set()
        for papers in result["sections"].values():
            for paper in papers:
                if id(paper) not in seen:
                    seen.add(id(paper))
                    paper["topics"] = canonicalize(paper["topics"], canonical)
        out_path = DATA_DIR / f"{journal_id}.json"
        out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False))
        total = sum(len(s) for s in result["sections"].values())
        print(f"  ✓ Wrote {out_path.name} ({total} total paper slots)")

    try:
        for name in write_feeds():
            print(f"  ✓ Wrote feeds/{name}")
    except Exception as exc:
        failures.append(f"RSS feeds: {exc}")
        print(f"  ✗ RSS feeds FAILED: {exc}")

    print(f"Done. {len(results)} succeeded, {len(failures)} failed.")
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
