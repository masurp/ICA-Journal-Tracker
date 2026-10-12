# ICA Journal Tracker

Static web app tracking academic papers across communication science journals. No build step — pure HTML/CSS/vanilla JS frontend, Python data pipeline.

## Running locally

```bash
python3 -m http.server 8000   # open http://localhost:8000
```

## Data pipeline

```bash
cd scripts
MAILTO=you@email.com ANTHROPIC_API_KEY=sk-... python fetch_data.py              # all journals
MAILTO=you@email.com ANTHROPIC_API_KEY=sk-... python fetch_data.py --journal jcmc  # one journal
python fetch_data.py --force   # ignore topic cache, re-tag every fetched paper
```

Pipeline per journal (4 steps):
1. OpenAlex — most cited (all time)
2. OpenAlex — latest
3. OpenAlex — trending (last 2 years, ≥2 citations, all candidates paged in, ranked by `trend_score`)
4. Claude Haiku 5.5 — topic keywords (cached by DOI in `data/topic_cache.json`, never regenerated unless --force)

After all journals: topic spellings are unified (most common spelling per lowercase/punctuation-insensitive key), then the JSONs are written.

## Architecture

```
index.html          minimal shell (no framework)
app.js              all frontend logic (~1600 lines)
style.css           all styles (~1500 lines)
data/journals.json  publisher + journal metadata (drives UI nav)
data/<id>.json      paper data per journal (written by fetch script)
data/topic_cache.json  DOI → LLM topics, persists across weekly runs (not loaded by the frontend)
feeds/*.xml         RSS 2.0 feeds (all.xml + one per publisher id), written by build_feeds.py
scripts/
  fetch_data.py     OpenAlex → JSON pipeline
  journal_config.py ISSN list (source of truth for which journals to fetch)
  build_feeds.py    RSS feeds from the `latest` sections; run at the end of fetch_data.py or standalone
```

**Data model per journal JSON:**
```json
{ "sections": { "most_cited": [...], "trending": [...], "latest": [...] } }
```
Each paper: `doi, title, authors, year, publication_date, citation_count, abstract, topics, url`, plus `trend_score` on papers in the trending section

## Key facts

- **No accumulation** — each weekly run replaces the top 50 snapshot per section
- **LLM cache** — topics are cached by DOI in `data/topic_cache.json` (seeded from the journal JSONs on first run); re-used across runs even when a paper leaves and re-enters the top lists
- **Topic vocabulary** — the ~200 most frequent cached topics are put in the (prompt-cached) system prompt so the LLM reuses existing labels; output is a JSON schema via `output_config.format`
- **Fallback** — if an OpenAlex query fails, that section keeps its previous snapshot; if all three fail, the journal file is left untouched and the run exits 1 (other journals are still committed)
- **No DOI, no paper** — OpenAlex queries use `has_doi:true` (DOI-less records were mostly book reviews with the reviewed book's citations)
- **OpenAlex** is the sole data source (switched from Crossref); citation counts are more complete
- **50 papers** stored per section per journal; UI shows 6 initially then "Show 4 more"
- **Trending**: last 2 years + `cited_by_count:>1`, ranked by `citations / (months since publication + 6)`. The UI defaults to All Time when a journal has fewer than 6 trending papers
- **Routing** — hash routes: none = overview, `#/journal/<id>`, `#/search?q=…&section=…&journal=…&from=…&to=…&sort=…`

## Publishers & journals

| Publisher | IDs in journals.json |
|-----------|----------------------|
| ICA (Oxford) | journal_of_communication, human_communication_research, communication_theory, jcmc, communication_culture_critique, annals_ica |
| SAGE | communication_research, new_media_society, social_media_society, mobile_media_communication, cyberpsychology_behavior, journalism_sage, jmcq, european_journal_communication |
| Taylor & Francis | political_communication, information_communication_society, digital_journalism, media_psychology_tandf, communication_methods_measures, communication_monographs, journal_broadcasting_electronic_media, journalism_studies |
| Hogrefe | journal_media_psychology |
| AUP | computational_communication_research |
| Cogitatio | media_communication |

## Adding a journal

1. `scripts/journal_config.py` — add entry with `id`, `name`, `issns`, `primary_issn`
2. `data/journals.json` — add entry under correct publisher with `id`, `name`, `short`, `issns`, `url` (`short` is used for the tabs and the heatmap)

## Deployment

GitHub Actions runs `fetch_data.py` every Monday 06:00 UTC, commits updated JSONs to main. GitHub Pages serves the static site. Secrets needed: `CROSSREF_MAILTO` (email for OpenAlex polite pool), `ANTHROPIC_API_KEY`.

Trigger a manual run: GitHub repo → Actions → Update Journal Data → Run workflow. Tick *Re-generate topic keywords* to run with `--force` (~3,000 Haiku calls, well under $1).
