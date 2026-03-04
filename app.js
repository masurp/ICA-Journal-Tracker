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
    tooltip: 'Papers published in the last 12 months, ranked by citation count. Shows what\'s gaining traction right now.',
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

function topicColor(topic) {
  let hash = 0;
  for (let i = 0; i < topic.length; i++) {
    hash = (hash * 31 + topic.charCodeAt(i)) >>> 0;
  }
  return TOPIC_PALETTE[hash % TOPIC_PALETTE.length];
}

function formatAuthors(authors) {
  if (!authors || authors.length === 0) return 'Unknown authors';
  if (authors.length <= 3) return authors.join(', ');
  return authors.slice(0, 3).join(', ') + ' et al.';
}

function renderTopics(topics) {
  if (!topics || topics.length === 0) return '';
  const chips = topics.slice(0, 3).map(topic => {
    const { bg, text } = topicColor(topic);
    return `<span class="topic-chip" style="background:${bg};color:${text}">${escapeHtml(topic)}</span>`;
  });
  return `<div class="paper-topics">${chips.join('')}</div>`;
}

function renderCard(paper, rank) {
  const rankStr = `#${rank}`;
  const authorsStr = formatAuthors(paper.authors);
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
      <div class="paper-authors">${escapeHtml(authorsStr)}</div>
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
    : 'last 12 months';

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

// ── App State ───────────────────────────────────────────────────────────────

let publishers = [];
let activePublisherId = null;
let activeJournalId = null;
const dataCache = {};

// ── Init ────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const config = await fetch('data/journals.json').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    publishers = config.publishers || [];
    renderPublisherTabs();
    if (publishers.length > 0) {
      await selectPublisher(publishers[0]);
    }
  } catch (err) {
    showError(`Failed to load journal config: ${err.message}`);
  }
}

// ── Publisher tabs ──────────────────────────────────────────────────────────

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
      if (pub) selectPublisher(pub, true);
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
  setActivePublisherTab(publisher.id);
  document.documentElement.style.setProperty('--journal-color', publisher.color);

  renderJournalTabs(publisher);

  const firstJournal = publisher.journals[0];
  if (firstJournal) {
    await loadJournal(firstJournal, publisher);
  }
}

// ── Journal tabs ────────────────────────────────────────────────────────────

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

// ── Journal loading ─────────────────────────────────────────────────────────

async function loadJournal(journal, publisher) {
  if (activeJournalId === journal.id) return;
  activeJournalId = journal.id;
  setActiveJournalTab(journal.id);
  document.documentElement.style.setProperty('--journal-color', publisher.color);

  const main = document.getElementById('main-content');

  if (!dataCache[journal.id]) {
    main.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading ${escapeHtml(journal.short)} data…</p></div>`;
  }

  try {
    if (!dataCache[journal.id]) {
      const data = await fetch(`data/${journal.id}.json`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
      dataCache[journal.id] = data;
    }
    const data = dataCache[journal.id];
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

// ── Boot ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
