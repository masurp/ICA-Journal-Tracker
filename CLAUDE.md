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
python fetch_data.py --force   # skip LLM cache, regenerate all topics
```

Pipeline per journal (4 steps):
1. OpenAlex — most cited (all time)
2. OpenAlex — latest
3. OpenAlex — trending (last 2 years, ≥5 citations)
4. Claude Haiku — topic keywords (cached by DOI, never regenerated unless --force)

## Architecture

```
index.html          minimal shell (no framework)
app.js              all frontend logic (~1200 lines)
style.css           all styles (~1400 lines)
data/journals.json  publisher + journal metadata (drives UI nav)
data/<id>.json      paper data per journal (written by fetch script)
scripts/
  fetch_data.py     OpenAlex → JSON pipeline
  journal_config.py ISSN list (source of truth for which journals to fetch)
```

**Data model per journal JSON:**
```json
{ "sections": { "most_cited": [...], "trending": [...], "latest": [...] } }
```
Each paper: `doi, title, authors, year, citation_count, abstract, topics, topics_llm, url`

## Key facts

- **No accumulation** — each weekly run replaces the top 50 snapshot per section
- **LLM cache** — topics are cached by DOI in existing JSONs; re-used across runs
- **OpenAlex** is the sole data source (switched from Crossref); citation counts are more complete
- **50 papers** stored per section per journal; UI shows 6 initially then "Show 4 more"
- **Trending filter**: last 2 years + `cited_by_count:>4` (≥5 citations)

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
2. `data/journals.json` — add entry under correct publisher with `id`, `name`, `short`, `issns`, `url`
3. `app.js` `ABBREVS` map in `renderHeatmapChart` — add heatmap abbreviation

## Deployment

GitHub Actions runs `fetch_data.py` every Monday 06:00 UTC, commits updated JSONs to main. GitHub Pages serves the static site. Secrets needed: `CROSSREF_MAILTO` (email for OpenAlex polite pool), `ANTHROPIC_API_KEY`.

Trigger a manual run: GitHub repo → Actions → Update Journal Data → Run workflow.
