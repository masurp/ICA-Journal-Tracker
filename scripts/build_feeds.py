#!/usr/bin/env python3
"""
ICA Journal Tracker — RSS feeds
Builds RSS 2.0 feeds of the newest papers from the journal JSONs in data/:
  feeds/all.xml             all journals
  feeds/<publisher_id>.xml  one per publisher in data/journals.json
Called at the end of fetch_data.py; can also be run on its own:
  python3 build_feeds.py
"""

import html
import json
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path

SITE_URL = "https://masurp.github.io/ICA-Journal-Tracker/"
DATA_DIR = Path(__file__).parent.parent / "data"
FEEDS_DIR = Path(__file__).parent.parent / "feeds"
MAX_ITEMS = 150   # ~3 weeks of papers across all journals; readers keep items they've already seen

ATOM_NS = "http://www.w3.org/2005/Atom"
DC_NS = "http://purl.org/dc/elements/1.1/"
ET.register_namespace("atom", ATOM_NS)
ET.register_namespace("dc", DC_NS)


def rfc822(value: str) -> str:
    """'2026-03-05' or '2026-03-05T06:00:00Z' → the date format RSS expects."""
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return format_datetime(dt.astimezone(timezone.utc), usegmt=True)


def sort_key(entry: tuple[dict, str]) -> str:
    paper = entry[0]
    # Snapshots written before publication_date was stored only have the year
    return paper.get("publication_date") or f"{paper.get('year') or 0:04d}"


def item_description(paper: dict, journal_name: str) -> str:
    lines = [f"<p><em>{html.escape(journal_name)}</em>"]
    if paper.get("authors"):
        lines[0] += f" · {html.escape(', '.join(paper['authors']))}"
    lines[0] += "</p>"
    if paper.get("topics"):
        lines.append(f"<p>Topics: {html.escape(', '.join(paper['topics']))}</p>")
    if paper.get("abstract"):
        lines.append(f"<p>{html.escape(paper['abstract'])}</p>")
    return "\n".join(lines)


def build_feed(filename: str, title: str, description: str, entries: list[tuple[dict, str]], build_date: str) -> None:
    rss = ET.Element("rss", {"version": "2.0"})
    channel = ET.SubElement(rss, "channel")
    ET.SubElement(channel, "title").text = title
    ET.SubElement(channel, "link").text = SITE_URL
    ET.SubElement(channel, "description").text = description
    ET.SubElement(channel, "language").text = "en"
    ET.SubElement(channel, "lastBuildDate").text = rfc822(build_date)
    ET.SubElement(channel, f"{{{ATOM_NS}}}link", {
        "href": f"{SITE_URL}feeds/{filename}", "rel": "self", "type": "application/rss+xml",
    })

    for paper, journal_name in sorted(entries, key=sort_key, reverse=True)[:MAX_ITEMS]:
        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = paper["title"]
        ET.SubElement(item, "link").text = paper["url"]
        ET.SubElement(item, "guid", {"isPermaLink": "true"}).text = paper["url"]
        if paper.get("publication_date"):
            ET.SubElement(item, "pubDate").text = rfc822(paper["publication_date"])
        if paper.get("authors"):
            ET.SubElement(item, f"{{{DC_NS}}}creator").text = ", ".join(paper["authors"])
        ET.SubElement(item, "category").text = journal_name
        for topic in paper.get("topics", []):
            ET.SubElement(item, "category").text = topic
        ET.SubElement(item, "description").text = item_description(paper, journal_name)

    ET.indent(rss)
    ET.ElementTree(rss).write(FEEDS_DIR / filename, encoding="utf-8", xml_declaration=True)


def write_feeds() -> list[str]:
    """Writes all feeds from the JSONs currently in data/. Returns the written filenames."""
    publishers = json.loads((DATA_DIR / "journals.json").read_text())["publishers"]
    FEEDS_DIR.mkdir(exist_ok=True)

    by_publisher: dict[str, list[tuple[dict, str]]] = {}
    updated: list[str] = []
    for pub in publishers:
        entries = by_publisher.setdefault(pub["id"], [])
        for journal in pub["journals"]:
            path = DATA_DIR / f"{journal['id']}.json"
            if not path.exists():
                continue
            data = json.loads(path.read_text())
            updated.append(data.get("updated_at", ""))
            entries += [(p, journal["name"]) for p in data.get("sections", {}).get("latest", []) if p.get("url")]
    build_date = max(filter(None, updated), default=datetime.now(timezone.utc).isoformat())

    n_journals = sum(len(pub["journals"]) for pub in publishers)
    written = ["all.xml"]
    build_feed(
        "all.xml",
        "Communication Science Journal Tracker — newest papers",
        f"Newest papers from {n_journals} communication science journals, with AI-generated topic keywords. Updated weekly.",
        [entry for entries in by_publisher.values() for entry in entries],
        build_date,
    )
    for pub in publishers:
        filename = f"{pub['id']}.xml"
        build_feed(
            filename,
            f"Communication Science Journal Tracker — {pub['name']} journals",
            f"Newest papers from the {len(pub['journals'])} {pub['full_name']} journals tracked "
            f"({', '.join(j['short'] for j in pub['journals'])}), with AI-generated topic keywords. Updated weekly.",
            by_publisher[pub["id"]],
            build_date,
        )
        written.append(filename)
    return written


if __name__ == "__main__":
    for name in write_feeds():
        print(f"  ✓ Wrote feeds/{name}")
