/* ICA Journal Tracker — Frontend */

// The first section supports a toggle between two datasets
const CITE_MODES = {
  most_cited: {
    key: 'most_cited',
    label: 'Most Cited',
    tooltip: 'Ranked by total citation count (Crossref). Established, high-impact papers.',
  },
  trending: {
    key: 'trending',
    label: 'Trending',
    tooltip: 'Papers published in the last 2 years, ranked by citation count. Shows what\'s gaining traction recently.',
  },
};

const LATEST_SECTION = {
  key: 'latest',
  label: 'Latest',
  tooltip: 'Most recently published articles, sorted by publication date.',
};

// Per-journal cite mode state (persists across tab switches)
const citeModeState = {};

// Deterministic topic chip color from string hash
const TOPIC_PALETTE = [
  { bg: 'rgba(79,142,247,0.18)',   text: '#7eb8ff' },
  { bg: 'rgba(62,207,142,0.18)',   text: '#5de6a8' },
  { bg: 'rgba(167,139,250,0.18)',  text: '#c4b0ff' },
  { bg: 'rgba(245,158,11,0.18)',   text: '#fcd34d' },
  { bg: 'rgba(248,113,113,0.18)',  text: '#fca5a5' },
  { bg: 'rgba(34,211,238,0.18)',   text: '#67e8f9' },
  { bg: 'rgba(251,146,60,0.18)',   text: '#fdba74' },
  { bg: 'rgba(163,230,53,0.18)',   text: '#bef264' },
];

// Stop words for title keyword extraction
const STOP_WORDS = new Set([
  'the','and','for','are','but','not','you','all','can','had','her','was','one',
  'our','out','get','has','him','his','how','man','new','now','old','see','two',
  'way','who','its','let','put','say','she','too','use','this','that','with',
  'from','they','have','been','than','your','more','will','into','just','some',
  'such','then','them','well','were','what','when','which','about','after','also',
  'back','even','most','over','same','take','does','each','make','many','much',
  'only','other','very','these','those','their','there','would','could','should',
  'being','between','through','during','without','across','using','used','based',
  'study','paper','case','role','effects','news','online','among','toward',
  'across','within','beyond','between','under','upon','both','here','there',
]);

function topicColor(topic) {
  let hash = 0;
  for (let i = 0; i < topic.length; i++) {
    hash = (hash * 31 + topic.charCodeAt(i)) >>> 0;
  }
  return TOPIC_PALETTE[hash % TOPIC_PALETTE.length];
}

function renderTopics(topics) {
  if (!topics || topics.length === 0) return '';
  const chips = topics.slice(0, 3).map(topic => {
    const { bg, text } = topicColor(topic);
    return `<span class="topic-chip" style="background:${bg};color:${text}">${escapeHtml(topic)}</span>`;
  });
  return `<div class="paper-topics">${chips.join('')}</div>`;
}

function renderAuthorLinks(authors) {
  if (!authors || authors.length === 0) return '<span>Unknown authors</span>';
  const displayed = authors.slice(0, 3).map(name =>
    `<a href="https://scholar.google.com/scholar?q=author%3A%22${encodeURIComponent(name)}%22" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a>`
  );
  const suffix = authors.length > 3 ? ' et al.' : '';
  return displayed.join(', ') + suffix;
}

function renderCard(paper, rank) {
  const rankStr = `#${rank}`;
  const yearStr = paper.year || '—';
  const citStr = paper.citation_count != null ? paper.citation_count.toLocaleString() : '—';

  return `
    <article class="paper-card">
      <span class="paper-rank">${rankStr}</span>
      ${renderTopics(paper.topics)}
      <div class="paper-title">
        <a href="${escapeHtml(paper.url)}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(paper.title)}
        </a>
      </div>
      <div class="paper-authors">${renderAuthorLinks(paper.authors)}</div>
      <div class="paper-footer">
        <div class="paper-meta">
          <span class="meta-badge">
            <span class="badge-icon">📅</span>${yearStr}
          </span>
          <span class="meta-badge">
            <span class="badge-icon">🔗</span>${citStr} citations
          </span>
        </div>
      </div>
    </article>
  `;
}

function renderCiteSection(data, journalId, journalColor) {
  const mode = citeModeState[journalId] || 'most_cited';
  const section = CITE_MODES[mode];
  const papers = data.sections?.[section.key] || [];
  const cardsHtml = papers.length > 0
    ? papers.map((p, i) => renderCard(p, i + 1)).join('')
    : '<div class="empty-card">No data available</div>';

  const trendingFrom = data.trending_from
    ? new Date(data.trending_from).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : 'last 2 years';

  return `
    <div class="section-col" id="cite-section-${escapeHtml(journalId)}">
      <div class="section-heading">
        <div class="cite-toggle" role="group" aria-label="Citation view">
          <button class="cite-toggle-btn ${mode === 'most_cited' ? 'active' : ''}"
            data-mode="most_cited" data-journal="${escapeHtml(journalId)}"
            style="--toggle-color:${journalColor}">
            All Time
          </button>
          <button class="cite-toggle-btn ${mode === 'trending' ? 'active' : ''}"
            data-mode="trending" data-journal="${escapeHtml(journalId)}"
            style="--toggle-color:${journalColor}">
            Trending
          </button>
        </div>
        <button class="section-info-btn" aria-label="Info">
          ⓘ
          <span class="section-tooltip">${escapeHtml(section.tooltip)}${mode === 'trending' ? ` Since ${trendingFrom}.` : ''}</span>
        </button>
      </div>
      ${cardsHtml}
    </div>
  `;
}

function renderLatestSection(data, journalColor) {
  const papers = data.sections?.[LATEST_SECTION.key] || [];
  const cardsHtml = papers.length > 0
    ? papers.map((p, i) => renderCard(p, i + 1)).join('')
    : '<div class="empty-card">No data available</div>';

  return `
    <div class="section-col">
      <div class="section-heading">
        <span class="section-label" style="color:${journalColor}">${escapeHtml(LATEST_SECTION.label)}</span>
        <button class="section-info-btn" aria-label="Info about Latest">
          ⓘ
          <span class="section-tooltip">${escapeHtml(LATEST_SECTION.tooltip)}</span>
        </button>
      </div>
      ${cardsHtml}
    </div>
  `;
}

function renderJournalView(journal, publisher, data) {
  const color = publisher.color;
  document.documentElement.style.setProperty('--journal-color', color);

  const sectionsHtml = renderCiteSection(data, journal.id, color)
    + renderLatestSection(data, color);

  return `
    <div class="journal-view">
      <div class="journal-header">
        <div class="journal-header-left">
          <span class="journal-publisher-badge" style="background:color-mix(in srgb, ${color} 15%, transparent);color:${color};border-color:color-mix(in srgb, ${color} 30%, transparent)">${escapeHtml(publisher.name)}</span>
          <h2 class="journal-name">${escapeHtml(journal.name)}</h2>
        </div>
        <a class="journal-link" href="${escapeHtml(journal.url)}" target="_blank" rel="noopener">
          Visit journal ↗
        </a>
      </div>
      <div class="sections-grid">
        ${sectionsHtml}
      </div>
    </div>
  `;
}

function setLastUpdated(isoString) {
  const el = document.getElementById('update-text');
  if (!isoString || !el) return;
  try {
    const d = new Date(isoString);
    el.textContent = `Updated ${d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`;
  } catch {
    el.textContent = 'Updated recently';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Trends ───────────────────────────────────────────────────────────────────

function extractTopWords(papers, topN = 30) {
  const counts = {};
  for (const paper of papers) {
    if (!paper.title) continue;
    const words = paper.title.toLowerCase().split(/[^a-z]+/).filter(w =>
      w.length >= 4 && !STOP_WORDS.has(w)
    );
    for (const w of words) {
      counts[w] = (counts[w] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}

// ── Overview ─────────────────────────────────────────────────────────────────

let overviewActive = false;

async function renderOverview() {
  overviewActive = true;
  trendsActive = false;
  activeJournalId = null;
  activePublisherId = null;

  document.querySelectorAll('.publisher-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  document.getElementById('trends-btn')?.classList.remove('active');
  document.getElementById('overview-btn')?.classList.add('active');
  document.getElementById('journal-tabs').innerHTML = '';

  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading overview…</p></div>`;

  await loadAllJournals();

  // Collect papers per section across all journals, with journal label
  const bySection = { most_cited: [], trending: [], latest: [] };
  const seenPerSection = { most_cited: new Set(), trending: new Set(), latest: new Set() };

  for (const pub of publishers) {
    for (const journal of pub.journals) {
      const data = dataCache[journal.id];
      if (!data) continue;
      for (const [sectionKey, papers] of Object.entries(data.sections)) {
        if (!(sectionKey in bySection)) continue;
        for (const paper of papers) {
          if (paper.doi && !seenPerSection[sectionKey].has(paper.doi)) {
            seenPerSection[sectionKey].add(paper.doi);
            bySection[sectionKey].push({ ...paper, _journalName: journal.name });
          }
        }
      }
    }
  }

  // Sort and take top 10
  const topCited = bySection.most_cited
    .sort((a, b) => (b.citation_count || 0) - (a.citation_count || 0))
    .slice(0, 10);
  const topTrending = bySection.trending
    .sort((a, b) => (b.citation_count || 0) - (a.citation_count || 0))
    .slice(0, 10);
  const topLatest = bySection.latest
    .sort((a, b) => (b.year || 0) - (a.year || 0))
    .slice(0, 10);

  function overviewSection(title, tooltip, papers) {
    const cards = papers.map((p, i) => `
      <div class="search-result-item">
        <div class="search-journal-label">${escapeHtml(p._journalName)}</div>
        ${renderCard(p, i + 1)}
      </div>
    `).join('');
    return `
      <div class="section-col">
        <div class="section-heading">
          <span class="section-label">${escapeHtml(title)}</span>
          <button class="section-info-btn" aria-label="Info">
            ⓘ
            <span class="section-tooltip">${escapeHtml(tooltip)}</span>
          </button>
        </div>
        ${cards}
      </div>
    `;
  }

  main.innerHTML = `
    <div class="overview-view">
      <div class="overview-header">
        <h2 class="overview-title">All Journals — Overview</h2>
        <p class="overview-sub">Top papers across all ${publishers.reduce((n, p) => n + p.journals.length, 0)} journals</p>
      </div>
      <div class="sections-grid">
        ${overviewSection('Most Cited', 'Top 10 most-cited papers across all journals (Crossref).', topCited)}
        ${overviewSection('Trending', 'Top 10 papers from the last 2 years by citation count, across all journals.', topTrending)}
        ${overviewSection('Latest', 'The 10 most recently published papers across all journals.', topLatest)}
      </div>
    </div>
  `;
}

async function renderTrendsView() {
  trendsActive = true;
  overviewActive = false;
  activeJournalId = null;
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  document.getElementById('trends-btn')?.classList.add('active');

  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading trends across all journals…</p></div>`;

  await loadAllJournals();

  const allPapers = getAllPapers();
  const topWords = extractTopWords(allPapers);

  if (topWords.length === 0) {
    main.innerHTML = `<div class="error-state">No title data available.</div>`;
    return;
  }

  const maxCount = topWords[0].count;
  const rows = topWords.map(({ word, count }) => {
    const pct = Math.round((count / maxCount) * 100);
    return `
      <div class="chart-row">
        <span class="chart-label">${escapeHtml(word)}</span>
        <div class="chart-bar-wrap">
          <div class="chart-bar" style="width:${pct}%">
            <span class="chart-count">${count}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  main.innerHTML = `
    <div class="trends-view">
      <div class="trends-header">
        <h2 class="trends-title">Keyword Trends</h2>
        <p class="trends-sub">Most frequent words in paper titles across all 16 journals — based on ${allPapers.length} unique papers</p>
      </div>
      <div class="trends-chart">${rows}</div>
    </div>
  `;
}

// ── Search ───────────────────────────────────────────────────────────────────

let searchDebounce = null;

function initSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const q = input.value.trim();
    if (!q) {
      restoreJournalView();
      return;
    }
    searchDebounce = setTimeout(() => performSearch(q), 250);
  });
}

async function loadAllJournals() {
  const fetches = [];
  for (const pub of publishers) {
    for (const journal of pub.journals) {
      if (!dataCache[journal.id]) {
        fetches.push(
          fetch(`data/${journal.id}.json`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) dataCache[journal.id] = data; })
            .catch(() => {})
        );
      }
    }
  }
  await Promise.all(fetches);
}

function getAllPapers() {
  const seen = new Set();
  const results = [];
  for (const pub of publishers) {
    for (const journal of pub.journals) {
      const data = dataCache[journal.id];
      if (!data) continue;
      for (const section of Object.values(data.sections)) {
        for (const paper of section) {
          if (paper.doi && !seen.has(paper.doi)) {
            seen.add(paper.doi);
            results.push({ ...paper, _journalName: journal.name });
          }
        }
      }
    }
  }
  return results;
}

async function performSearch(query) {
  trendsActive = false;
  overviewActive = false;
  document.getElementById('trends-btn')?.classList.remove('active');
  document.getElementById('overview-btn')?.classList.remove('active');
  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Searching across all journals…</p></div>`;

  await loadAllJournals();

  const q = query.toLowerCase();
  const results = getAllPapers()
    .filter(p =>
      p.title?.toLowerCase().includes(q) ||
      p.authors?.some(a => a.toLowerCase().includes(q))
    )
    .sort((a, b) => (b.citation_count || 0) - (a.citation_count || 0));

  main.innerHTML = renderSearchResults(query, results);
}

function renderSearchResults(query, results) {
  const header = `
    <div class="search-results-header">
      ${results.length} paper${results.length !== 1 ? 's' : ''} matching <em>"${escapeHtml(query)}"</em> across all journals
    </div>
  `;

  if (results.length === 0) {
    return `<div class="search-results">${header}<div class="empty-card" style="margin-top:1rem">No papers found. Try a different keyword.</div></div>`;
  }

  const cards = results.map((paper, i) => `
    <div class="search-result-item">
      <div class="search-journal-label">${escapeHtml(paper._journalName)}</div>
      ${renderCard(paper, i + 1)}
    </div>
  `).join('');

  return `<div class="search-results">${header}<div class="search-cards">${cards}</div></div>`;
}

function restoreJournalView() {
  trendsActive = false;
  document.getElementById('trends-btn')?.classList.remove('active');
  const pub = publishers.find(p => p.id === activePublisherId);
  const journal = pub?.journals.find(j => j.id === activeJournalId);
  if (!journal || !pub || !dataCache[journal.id]) return;
  const main = document.getElementById('main-content');
  main.innerHTML = renderJournalView(journal, pub, dataCache[journal.id]);
  setLastUpdated(dataCache[journal.id].updated_at);
  bindToggleButtons(journal, pub);
}

// ── App State ────────────────────────────────────────────────────────────────

let publishers = [];
let activePublisherId = null;
let activeJournalId = null;
let trendsActive = false;
const dataCache = {};

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const config = await fetch('data/journals.json').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    publishers = config.publishers || [];
    renderPublisherTabs();
    initSearch();
    document.getElementById('overview-btn')?.addEventListener('click', () => {
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.value = '';
      renderOverview();
    });
    document.getElementById('trends-btn')?.addEventListener('click', () => {
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.value = '';
      renderTrendsView();
    });
    await renderOverview();
  } catch (err) {
    showError(`Failed to load journal config: ${err.message}`);
  }
}

// ── Publisher tabs ────────────────────────────────────────────────────────────

function renderPublisherTabs() {
  const nav = document.getElementById('publisher-tabs');
  nav.innerHTML = publishers.map(p => `
    <button
      class="publisher-btn"
      role="tab"
      data-publisher-id="${escapeHtml(p.id)}"
      style="--pub-color: ${escapeHtml(p.color)}"
      aria-selected="false"
      aria-label="${escapeHtml(p.full_name)}"
    >
      <span class="pub-name">${escapeHtml(p.name)}</span>
      <span class="pub-count">${p.journals.length}</span>
    </button>
  `).join('');

  nav.querySelectorAll('.publisher-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pub = publishers.find(p => p.id === btn.dataset.publisherId);
      if (pub) selectPublisher(pub);
    });
  });
}

function setActivePublisherTab(publisherId) {
  document.querySelectorAll('.publisher-btn').forEach(btn => {
    const isActive = btn.dataset.publisherId === publisherId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

async function selectPublisher(publisher) {
  activePublisherId = publisher.id;
  activeJournalId = null;
  trendsActive = false;
  overviewActive = false;
  document.getElementById('trends-btn')?.classList.remove('active');
  document.getElementById('overview-btn')?.classList.remove('active');
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  setActivePublisherTab(publisher.id);
  document.documentElement.style.setProperty('--journal-color', publisher.color);

  renderJournalTabs(publisher);

  const firstJournal = publisher.journals[0];
  if (firstJournal) {
    await loadJournal(firstJournal, publisher);
  }
}

// ── Journal tabs ──────────────────────────────────────────────────────────────

function renderJournalTabs(publisher) {
  const nav = document.getElementById('journal-tabs');
  nav.innerHTML = publisher.journals.map(j => `
    <button
      class="tab-btn"
      role="tab"
      data-journal-id="${escapeHtml(j.id)}"
      aria-selected="false"
      aria-label="${escapeHtml(j.name)}"
    >
      <span class="tab-short">${escapeHtml(j.short)}</span>
      <span class="tab-name">${escapeHtml(j.name)}</span>
    </button>
  `).join('');

  nav.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pub = publishers.find(p => p.id === activePublisherId);
      const journal = pub?.journals.find(j => j.id === btn.dataset.journalId);
      if (journal && pub) loadJournal(journal, pub);
    });
  });
}

function setActiveJournalTab(journalId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.dataset.journalId === journalId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (isActive) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });
}

// ── Journal loading ───────────────────────────────────────────────────────────

async function loadJournal(journal, publisher) {
  trendsActive = false;
  overviewActive = false;
  document.getElementById('trends-btn')?.classList.remove('active');
  document.getElementById('overview-btn')?.classList.remove('active');
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  activeJournalId = journal.id;
  setActiveJournalTab(journal.id);
  document.documentElement.style.setProperty('--journal-color', publisher.color);

  const main = document.getElementById('main-content');

  if (dataCache[journal.id]) {
    main.innerHTML = renderJournalView(journal, publisher, dataCache[journal.id]);
    setLastUpdated(dataCache[journal.id].updated_at);
    bindToggleButtons(journal, publisher);
    return;
  }

  main.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading ${escapeHtml(journal.short)} data…</p></div>`;

  try {
    const data = await fetch(`data/${journal.id}.json`).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    dataCache[journal.id] = data;
    if (activeJournalId !== journal.id) return;
    main.innerHTML = renderJournalView(journal, publisher, data);
    setLastUpdated(data.updated_at);
    bindToggleButtons(journal, publisher);
  } catch (err) {
    main.innerHTML = `<div class="error-state">⚠ Failed to load ${escapeHtml(journal.name)}: ${escapeHtml(err.message)}</div>`;
  }
}

function bindToggleButtons(journal, publisher) {
  document.querySelectorAll('.cite-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      const journalId = btn.dataset.journal;
      if (citeModeState[journalId] === mode) return;
      citeModeState[journalId] = mode;
      const data = dataCache[journalId];
      if (!data) return;
      const col = document.getElementById(`cite-section-${journalId}`);
      if (col) col.outerHTML = renderCiteSection(data, journalId, publisher.color);
      bindToggleButtons(journal, publisher);
    });
  });
}

function showError(msg) {
  document.getElementById('main-content').innerHTML =
    `<div class="error-state">⚠ ${escapeHtml(msg)}</div>`;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
