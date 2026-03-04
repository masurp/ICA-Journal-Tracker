/* ICA Journal Tracker — Frontend */

const SECTIONS = [
  {
    key: 'most_cited',
    label: 'Most Cited',
    tooltip: 'Ranked by total citation count from Crossref. Includes all citations since publication.',
  },
  {
    key: 'latest',
    label: 'Latest',
    tooltip: 'Most recently published articles, sorted by publication date.',
  },
];

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

function renderSection(section, papers, journalColor) {
  const cardsHtml = papers && papers.length > 0
    ? papers.map((p, i) => renderCard(p, i + 1)).join('')
    : '<div class="empty-card">No data available</div>';

  return `
    <div class="section-col">
      <div class="section-heading">
        <span class="section-label" style="color:${journalColor}">${escapeHtml(section.label)}</span>
        <button class="section-info-btn" aria-label="Info about ${escapeHtml(section.label)}">
          ⓘ
          <span class="section-tooltip">${escapeHtml(section.tooltip)}</span>
        </button>
      </div>
      ${cardsHtml}
    </div>
  `;
}

function renderJournalView(journal, data) {
  const color = journal.color;
  document.documentElement.style.setProperty('--journal-color', color);

  const sectionsHtml = SECTIONS.map(sec => {
    const papers = data.sections?.[sec.key] || [];
    return renderSection(sec, papers, color);
  }).join('');

  return `
    <div class="journal-view">
      <div class="journal-header">
        <h2 class="journal-name">${escapeHtml(journal.name)}</h2>
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

let journals = [];
let activeJournalId = null;
const dataCache = {};

// ── Init ────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const config = await fetch('data/journals.json').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    journals = config.journals || [];
    renderTabs();
    if (journals.length > 0) {
      await loadJournal(journals[0]);
    }
  } catch (err) {
    showError(`Failed to load journal config: ${err.message}`);
  }
}

function renderTabs() {
  const nav = document.getElementById('journal-tabs');
  nav.innerHTML = journals.map(j => `
    <button
      class="tab-btn"
      role="tab"
      data-journal-id="${escapeHtml(j.id)}"
      style="--journal-color: ${escapeHtml(j.color)}"
      aria-selected="false"
      aria-label="${escapeHtml(j.name)}"
    >
      <span class="tab-short">${escapeHtml(j.short)}</span>
      <span class="tab-name">${escapeHtml(j.name)}</span>
    </button>
  `).join('');

  nav.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.journalId;
      const journal = journals.find(j => j.id === id);
      if (journal) loadJournal(journal);
    });
  });
}

function setActiveTab(journalId) {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    const isActive = btn.dataset.journalId === journalId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (isActive) {
      // scroll tab into view on mobile
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });
}

async function loadJournal(journal) {
  if (activeJournalId === journal.id) return;
  activeJournalId = journal.id;
  setActiveTab(journal.id);

  // Update root journal color for header accent
  document.documentElement.style.setProperty('--journal-color', journal.color);

  const main = document.getElementById('main-content');

  // Show loading state only on first load of this journal
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
    main.innerHTML = renderJournalView(journal, data);
    setLastUpdated(data.updated_at);
  } catch (err) {
    main.innerHTML = `<div class="error-state">⚠ Failed to load ${escapeHtml(journal.name)}: ${escapeHtml(err.message)}</div>`;
  }
}

function showError(msg) {
  document.getElementById('main-content').innerHTML =
    `<div class="error-state">⚠ ${escapeHtml(msg)}</div>`;
}

// ── Boot ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
