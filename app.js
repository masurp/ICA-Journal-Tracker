/* ICA Journal Tracker — Frontend */

// The first section supports a toggle between two datasets
const CITE_MODES = {
  most_cited: {
    key: 'most_cited',
    label: 'Most Cited',
    tooltip: 'Ranked by total citation count (OpenAlex). Established, high-impact papers.',
  },
  trending: {
    key: 'trending',
    label: 'Trending',
    tooltip: 'Papers from the last 2 years with at least 2 citations, ranked by citations per month since publication. Shows what\'s gaining traction now.',
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
  const key = topic.toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return TOPIC_PALETTE[hash % TOPIC_PALETTE.length];
}

function renderTopics(topics) {
  if (!topics || topics.length === 0) return '';
  const chips = topics.slice(0, 3).map(topic => {
    const { bg, text } = topicColor(topic);
    return `<span class="topic-chip" data-topic="${escapeHtml(topic)}" style="background:${bg};color:${text}" title="Search all papers tagged '${escapeHtml(topic)}'">${escapeHtml(topic)}</span>`;
  });
  return `<div class="paper-topics">${chips.join('')}</div>`;
}

function renderAuthorLinks(authors, terms = null) {
  if (!authors || authors.length === 0) return '<span>Unknown authors</span>';
  const displayed = authors.slice(0, 3).map(name =>
    `<a href="https://scholar.google.com/scholar?q=author%3A%22${encodeURIComponent(name)}%22" target="_blank" rel="noopener noreferrer">${highlightText(name, terms)}</a>`
  );
  const suffix = authors.length > 3 ? ' et al.' : '';
  return displayed.join(', ') + suffix;
}

// ── Sorting ──────────────────────────────────────────────────────────────────

const byCitations = (a, b) => (b.citation_count || 0) - (a.citation_count || 0);
// Falls back to the year for snapshots written before publication_date was stored
const byNewest = (a, b) => String(b.publication_date || b.year || '').localeCompare(String(a.publication_date || a.year || ''));
const byTrend = (a, b) => (b.trend_score ?? -1) - (a.trend_score ?? -1) || byCitations(a, b);

function renderCard(paper, rank, { terms = null } = {}) {
  const rankStr = `#${rank}`;
  const yearStr = paper.year || '—';
  const citStr = paper.citation_count != null ? paper.citation_count.toLocaleString() : '—';
  const journalStr = paper._journalName
    ? `<span class="meta-badge meta-badge-journal">${escapeHtml(paper._journalName)}</span>`
    : '';
  const doiAttr = escapeHtml(paper.doi || '');

  return `
    <article class="paper-card">
      <span class="paper-rank">${rankStr}</span>
      ${renderTopics(paper.topics)}
      <div class="paper-title">
        <a href="${escapeHtml(paper.url)}" target="_blank" rel="noopener noreferrer">
          ${highlightText(paper.title, terms)}
        </a>
      </div>
      <div class="paper-authors">${renderAuthorLinks(paper.authors, terms)}</div>
      ${terms ? renderAbstractSnippet(paper, terms) : ''}
      <div class="paper-footer">
        <div class="paper-meta">
          <span class="meta-badge">
            <span class="badge-icon">📅</span>${yearStr}
          </span>
          <span class="meta-badge">
            <span class="badge-icon">🔗</span>${citStr} citations
          </span>
          ${journalStr}
        </div>
        ${paper.abstract ? `<button class="paper-details-btn" data-doi="${doiAttr}" aria-label="Show abstract">Abstract ↗</button>` : ''}
      </div>
    </article>
  `;
}

// ── Paper Detail Modal ────────────────────────────────────────────────────────

const paperIndex = new Map(); // doi → paper object, built on demand

function indexPaper(paper) {
  if (paper.doi) paperIndex.set(paper.doi.toLowerCase(), paper);
}

function openPaperModal(doi) {
  const paper = paperIndex.get(doi.toLowerCase());
  if (!paper) return;

  const yearStr = paper.year || '—';
  const citStr = paper.citation_count != null ? paper.citation_count.toLocaleString() : '—';
  const topicsHtml = renderTopics(paper.topics);
  const abstractHtml = paper.abstract
    ? `<p class="modal-abstract">${escapeHtml(paper.abstract)}</p>`
    : `<p class="modal-abstract modal-abstract-empty">No abstract available.</p>`;

  const modal = document.getElementById('paper-modal');
  document.getElementById('modal-title').textContent = paper.title;
  document.getElementById('modal-authors').innerHTML = renderAuthorLinks(paper.authors);
  document.getElementById('modal-meta').innerHTML = `
    <span class="meta-badge"><span class="badge-icon">📅</span>${yearStr}</span>
    <span class="meta-badge"><span class="badge-icon">🔗</span>${citStr} citations</span>
    ${paper._journalName ? `<span class="meta-badge meta-badge-journal">${escapeHtml(paper._journalName)}</span>` : ''}
  `;
  document.getElementById('modal-topics').innerHTML = topicsHtml;
  document.getElementById('modal-abstract-wrap').innerHTML = abstractHtml;
  document.getElementById('modal-link').href = paper.url || '#';

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePaperModal() {
  document.getElementById('paper-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function initModal() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.paper-details-btn[data-doi]');
    if (btn) { openPaperModal(btn.dataset.doi); return; }
    if (e.target.id === 'paper-modal' || e.target.closest('.modal-close-btn')) closePaperModal();

    const searchMore = e.target.closest('.search-more-btn');
    if (searchMore) { showMoreSearchResults(searchMore); return; }

    const showMore = e.target.closest('.show-more-btn');
    if (showMore) {
      const container = showMore.closest('.section-col') || showMore.parentElement;
      const hiddenSlots = [...container.querySelectorAll('.paper-slot[hidden]')];
      hiddenSlots.slice(0, SHOW_MORE_STEP).forEach(s => s.removeAttribute('hidden'));
      const remaining = container.querySelectorAll('.paper-slot[hidden]').length;
      if (remaining === 0) showMore.remove();
      else showMore.textContent = `Show ${Math.min(SHOW_MORE_STEP, remaining)} more`;
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePaperModal();
  });
}

const INITIAL_VISIBLE = 6;
const SHOW_MORE_STEP = 4;

function renderPapersWithShowMore(papers) {
  const html = papers.map((p, i) =>
    `<div class="paper-slot"${i >= INITIAL_VISIBLE ? ' hidden' : ''}>${renderCard(p, i + 1)}</div>`
  ).join('');
  const remaining = papers.length - INITIAL_VISIBLE;
  if (remaining <= 0) return html;
  return html + `<button class="show-more-btn">Show ${Math.min(SHOW_MORE_STEP, remaining)} more</button>`;
}

// Trending is the default view, unless a journal has too few trending papers to fill it
function defaultCiteMode(data) {
  return (data.sections?.trending?.length || 0) >= INITIAL_VISIBLE ? 'trending' : 'most_cited';
}

function renderCiteSection(data, journalId, journalColor) {
  const mode = citeModeState[journalId] || defaultCiteMode(data);
  const section = CITE_MODES[mode];
  const papers = data.sections?.[section.key] || [];
  const cardsHtml = papers.length > 0
    ? renderPapersWithShowMore(papers)
    : '<div class="empty-card">No data available</div>';

  const trendingFrom = data.trending_from
    ? new Date(data.trending_from).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : 'last 2 years';

  return `
    <div class="section-col" id="cite-section-${escapeHtml(journalId)}">
      <div class="section-heading">
        <div class="cite-toggle" role="group" aria-label="Citation view">
          <button class="cite-toggle-btn ${mode === 'trending' ? 'active' : ''}"
            data-mode="trending" data-journal="${escapeHtml(journalId)}"
            style="--toggle-color:${journalColor}">
            Trending
          </button>
          <button class="cite-toggle-btn ${mode === 'most_cited' ? 'active' : ''}"
            data-mode="most_cited" data-journal="${escapeHtml(journalId)}"
            style="--toggle-color:${journalColor}">
            All Time
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
    ? renderPapersWithShowMore(papers)
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

  const sectionsHtml = renderLatestSection(data, color)
    + renderCiteSection(data, journal.id, color);

  return `
    <div class="journal-view">
      <div class="journal-header">
        <div class="journal-header-left">
          <span class="journal-publisher-badge" style="background:color-mix(in srgb, ${color} 15%, transparent);color:${color};border-color:color-mix(in srgb, ${color} 30%, transparent)">${escapeHtml(publisher.name)}</span>
          <h2 class="journal-name">${escapeHtml(journal.name)}</h2>
        </div>
        <div class="journal-header-actions">
          <button class="trends-anchor-btn" id="journal-trends-anchor-btn">Keyword Trends ↓</button>
          <a class="journal-link" href="${escapeHtml(journal.url)}" target="_blank" rel="noopener">Visit journal ↗</a>
        </div>
      </div>
      <div class="sections-grid">
        ${sectionsHtml}
      </div>
      ${renderJournalTrendsSection(data, journal, publisher)}
    </div>
  `;
}

function renderJournalTrendsSection(data, _journal, publisher) {
  const papers = collectPapersFromSections(data, journalTrendsSections);
  const modeButtons = [
    ['alluvial',          'Topic Flow'],
    ['openalex_keywords', 'AI Keywords'],
    ['clusters',          'Topic Clusters'],
  ].map(([m, label]) =>
    `<button class="trends-toggle-btn journal-trends-btn ${journalTrendsMode === m ? 'active' : ''}" data-jmode="${m}" style="--toggle-color:${publisher.color}">${label}</button>`
  ).join('');

  const yearRangeHtml = journalTrendsMode === 'alluvial'
    ? renderYearRangeHtml(papers, journalTrendsYearMin, journalTrendsYearMax)
    : '';
  const chart = journalTrendsMode === 'alluvial'
    ? renderAlluvialChart(papers, journalTrendsYearMin, journalTrendsYearMax)
    : renderTrendsChartHtml(papers, journalTrendsMode);

  return `
    <div class="journal-trends-section" id="journal-trends-section">
      <div class="trends-header">
        <h2 class="trends-title">Topic Trends</h2>
        <div class="trends-toggle" role="group" aria-label="Trend view">${modeButtons}</div>
      </div>
      <div class="trends-controls" id="journal-trends-controls">
        ${renderSectionFilterHtml(journalTrendsSections)}
        ${yearRangeHtml}
      </div>
      <div id="journal-trends-chart">${chart}</div>
    </div>
  `;
}

function refreshJournalTrendsControls(data) {
  const papers = collectPapersFromSections(data, journalTrendsSections);
  const yearRangeHtml = journalTrendsMode === 'alluvial'
    ? renderYearRangeHtml(papers, journalTrendsYearMin, journalTrendsYearMax)
    : '';
  const el = document.getElementById('journal-trends-controls');
  if (el) {
    el.innerHTML = renderSectionFilterHtml(journalTrendsSections) + yearRangeHtml;
    bindJournalSectionFilter(data);
    bindJournalYearRange(data);
  }
}

function refreshJournalTrendsChart(data) {
  const papers = collectPapersFromSections(data, journalTrendsSections);
  const el = document.getElementById('journal-trends-chart');
  if (el) {
    el.innerHTML = journalTrendsMode === 'alluvial'
      ? renderAlluvialChart(papers, journalTrendsYearMin, journalTrendsYearMax)
      : renderTrendsChartHtml(papers, journalTrendsMode);
  }
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

function extractTopKeywords(papers, topN = 30) {
  const counts = {};
  for (const paper of papers) {
    if (!paper.topics || paper.topics.length === 0) continue;
    for (const topic of paper.topics) {
      const key = topic.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}

function extractTopicClusters(papers, maxClusters = 8) {
  // Build keyword → papers index
  const keywordPapers = {};
  for (const paper of papers) {
    if (!paper.topics || paper.topics.length === 0) continue;
    for (const topic of paper.topics) {
      const key = topic.toLowerCase();
      if (!keywordPapers[key]) keywordPapers[key] = [];
      keywordPapers[key].push(paper);
    }
  }

  // Build co-occurrence matrix (keyword pairs that appear on same paper)
  const cooccur = {};
  for (const paper of papers) {
    if (!paper.topics || paper.topics.length < 2) continue;
    const keys = paper.topics.map(t => t.toLowerCase());
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const pair = [keys[i], keys[j]].sort().join('|||');
        cooccur[pair] = (cooccur[pair] || 0) + 1;
      }
    }
  }

  // Greedy clustering: start with most frequent keyword, absorb co-occurring ones
  const allKeywords = Object.keys(keywordPapers).sort((a, b) =>
    keywordPapers[b].length - keywordPapers[a].length
  );
  const assigned = new Set();
  const clusters = [];

  for (const seed of allKeywords) {
    if (assigned.has(seed)) continue;
    if (clusters.length >= maxClusters) break;

    const cluster = { keywords: [seed], paperDois: new Set() };
    assigned.add(seed);
    for (const p of keywordPapers[seed]) { if (p.doi) cluster.paperDois.add(p.doi); }

    // Find co-occurring keywords with this seed
    const candidates = [];
    for (const kw of allKeywords) {
      if (assigned.has(kw)) continue;
      const pair = [seed, kw].sort().join('|||');
      const score = cooccur[pair] || 0;
      if (score >= 2) candidates.push({ kw, score });
    }
    candidates.sort((a, b) => b.score - a.score);

    for (const { kw } of candidates.slice(0, 4)) {
      assigned.add(kw);
      cluster.keywords.push(kw);
      for (const p of keywordPapers[kw]) { if (p.doi) cluster.paperDois.add(p.doi); }
    }

    if (cluster.paperDois.size >= 3) {
      clusters.push({
        name: cluster.keywords[0],
        keywords: cluster.keywords,
        count: cluster.paperDois.size,
      });
    }
  }

  return clusters;
}

// ── Topic-by-year & cross-journal helpers ─────────────────────────────────────

function collectPapersFromSections(data, sectionKeys) {
  const seen = new Set();
  const papers = [];
  for (const key of sectionKeys) {
    for (const paper of (data.sections?.[key] || [])) {
      if (paper.doi && !seen.has(paper.doi)) {
        seen.add(paper.doi);
        papers.push(paper);
      }
    }
  }
  return papers;
}

function aggregateTopicsByYear(papers) {
  const byYear = {};
  for (const paper of papers) {
    if (!paper.year || !paper.topics?.length) continue;
    if (!byYear[paper.year]) byYear[paper.year] = {};
    for (const topic of paper.topics) {
      const k = topic.toLowerCase();
      if (!byYear[paper.year][k]) byYear[paper.year][k] = { count: 0, label: topic };
      byYear[paper.year][k].count++;
    }
  }
  return byYear;
}

function renderSectionFilterHtml(activeSections) {
  return `<div class="section-filter">${[
    ['most_cited', 'Most Cited'],
    ['trending',   'Trending'],
    ['latest',     'Latest'],
  ].map(([key, label]) =>
    `<button class="section-filter-btn${activeSections.has(key) ? ' active' : ''}" data-section="${key}">${label}</button>`
  ).join('')}</div>`;
}

function renderYearRangeHtml(papers, selectedMin, selectedMax) {
  const years = [...new Set(papers.filter(p => p.year).map(p => p.year))].sort((a, b) => a - b);
  if (years.length < 2) return '';
  return `<div class="year-range-filter">
    <span class="year-range-label">Years</span>
    <select class="year-range-select" id="year-min-select">
      <option value="">From</option>
      ${years.map(y => `<option value="${y}" ${y == selectedMin ? 'selected' : ''}>${y}</option>`).join('')}
    </select>
    <span class="year-range-sep">–</span>
    <select class="year-range-select" id="year-max-select">
      <option value="">To</option>
      ${years.map(y => `<option value="${y}" ${y == selectedMax ? 'selected' : ''}>${y}</option>`).join('')}
    </select>
  </div>`;
}

function renderByYearChart(papers, yearMin, yearMax) {
  const byYear = aggregateTopicsByYear(papers);
  let years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  if (yearMin) years = years.filter(y => y >= yearMin);
  if (yearMax) years = years.filter(y => y <= yearMax);
  if (!years.length) return '<div class="empty-card">No data for selected year range.</div>';

  const rows = years.map(year => {
    const items = Object.entries(byYear[year])
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6);
    if (!items.length) return '';
    const maxCount = items[0][1].count;
    const bars = items.map(([, { count, label }]) => {
      const pct = Math.round((count / maxCount) * 100);
      const { bg, text } = topicColor(label);
      return `<div class="byyear-row">
        <span class="byyear-topic">${escapeHtml(label)}</span>
        <div class="byyear-bar-wrap">
          <div class="byyear-bar" style="width:${pct}%;background:${bg}">
            <span class="byyear-count" style="color:${text}">${count}</span>
          </div>
        </div>
      </div>`;
    }).join('');
    return `<div class="byyear-group">
      <div class="byyear-year">${year}</div>
      <div class="byyear-bars">${bars}</div>
    </div>`;
  }).filter(Boolean).join('');

  return rows ? `<div class="byyear-chart">${rows}</div>` : '<div class="empty-card">No topic data available.</div>';
}

const MAX_FLOW_YEARS = 10;

function renderAlluvialChart(papers, yearMin = null, yearMax = null) {
  const byYear = aggregateTopicsByYear(papers);
  let years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  if (yearMin) years = years.filter(y => y >= yearMin);
  if (yearMax) years = years.filter(y => y <= yearMax);
  let note = '';
  if (years.length > MAX_FLOW_YEARS) {
    note = `Showing the ${MAX_FLOW_YEARS} most recent of ${years.length} years with data (${years[0]}–${years[years.length - 1]}). Use the year filter to see earlier years.`;
    years = years.slice(-MAX_FLOW_YEARS);
  }
  if (years.length < 2) return '<div class="empty-card">Need papers from at least 2 different years. Try enabling "Most Cited".</div>';

  // Top topics are picked within the displayed years only
  const totalCounts = {}, topicLabels = {};
  for (const yr of years) {
    for (const [k, { count, label }] of Object.entries(byYear[yr])) {
      totalCounts[k] = (totalCounts[k] || 0) + count;
      topicLabels[k] = label;
    }
  }
  const topTopics = Object.entries(totalCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);

  const W = 900, H = 300, PAD_T = 20, PAD_B = 22;
  const CHART_H = H - PAD_T - PAD_B;
  const colW = W / years.length;
  const blockW = Math.min(colW * 0.55, 100);
  const blockX = i => i * colW + (colW - blockW) / 2;
  const GAP = 2;

  const maxTotal = Math.max(...years.map(yr =>
    topTopics.reduce((s, t) => s + (byYear[yr]?.[t]?.count || 0), 0)
  ));
  if (!maxTotal) return '<div class="empty-card">No topic data available.</div>';

  const pos = {};
  for (let i = 0; i < years.length; i++) {
    const yr = years[i];
    pos[yr] = {};
    const x = blockX(i);
    const sorted = [...topTopics].sort((a, b) => (byYear[yr]?.[b]?.count || 0) - (byYear[yr]?.[a]?.count || 0));
    let y = PAD_T;
    for (const tk of sorted) {
      const count = byYear[yr]?.[tk]?.count || 0;
      if (!count) continue;
      const h = Math.max(2, (count / maxTotal) * (CHART_H - GAP * topTopics.length));
      pos[yr][tk] = { x, y, h };
      y += h + GAP;
    }
  }

  let svg = '';
  for (let i = 0; i < years.length - 1; i++) {
    const yr1 = years[i], yr2 = years[i + 1];
    for (const tk of topTopics) {
      const b1 = pos[yr1][tk], b2 = pos[yr2][tk];
      if (!b1 || !b2) continue;
      const { bg } = topicColor(topicLabels[tk]);
      const x1 = b1.x + blockW, x2 = b2.x, mx = (x1 + x2) / 2;
      svg += `<path d="M${x1},${b1.y} C${mx},${b1.y} ${mx},${b2.y} ${x2},${b2.y} L${x2},${b2.y+b2.h} C${mx},${b2.y+b2.h} ${mx},${b1.y+b1.h} ${x1},${b1.y+b1.h} Z" fill="${bg}" opacity="0.3"/>`;
    }
  }
  for (let i = 0; i < years.length; i++) {
    const yr = years[i];
    for (const tk of topTopics) {
      const b = pos[yr][tk];
      if (!b) continue;
      const { bg, text } = topicColor(topicLabels[tk]);
      svg += `<rect x="${b.x}" y="${b.y}" width="${blockW}" height="${b.h}" fill="${bg}" rx="2" opacity="0.9"/>`;
      if (b.h >= 13) {
        const fs = Math.min(9, b.h - 4);
        svg += `<text x="${b.x + blockW / 2}" y="${b.y + b.h / 2 + fs * 0.35}" text-anchor="middle" font-size="${fs}" fill="${text}" font-family="Inter,sans-serif">${escapeHtml(topicLabels[tk])}</text>`;
      }
    }
    svg += `<text x="${blockX(i) + blockW / 2}" y="${H - 4}" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="Inter,sans-serif">${years[i]}</text>`;
  }

  const noteHtml = note ? `<p class="alluvial-note">${escapeHtml(note)}</p>` : '';
  return `${noteHtml}<div class="alluvial-wrapper"><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">${svg}</svg></div>`;
}

// journalPapers: [{ journal, papers }] in nav order
function renderHeatmapChart(journalPapers) {
  const allPapers = journalPapers.flatMap(j => j.papers);
  const topTopics = extractTopKeywords(allPapers, 15).map(({ word }) => word);
  if (!topTopics.length) return '<div class="empty-card">No topic data available.</div>';

  const header = `<div class="hm-cell hm-corner"></div>${journalPapers.map(({ journal }) =>
    `<div class="hm-cell hm-header" title="${escapeHtml(journal.name)}"><span class="hm-abbrev">${escapeHtml(journal.short)}</span></div>`
  ).join('')}`;

  const rows = topTopics.map(tk => {
    const cells = journalPapers.map(({ papers }) =>
      papers.filter(p => p.topics?.some(t => t.toLowerCase() === tk)).length
    );
    const maxCount = Math.max(...cells, 1);
    return `<div class="hm-cell hm-topic">${escapeHtml(tk)}</div>${cells.map(count => {
      const alpha = count > 0 ? Math.max(0.1, (count / maxCount) * 0.85) : 0;
      const bg = count > 0 ? `rgba(99,102,241,${alpha.toFixed(2)})` : 'transparent';
      return `<div class="hm-cell hm-value" style="background:${bg}" title="${count > 0 ? count + ' papers' : ''}">${count > 0 ? count : ''}</div>`;
    }).join('')}`;
  }).join('');

  return `<div class="heatmap-scroll">
    <div class="heatmap-grid" style="grid-template-columns:140px ${journalPapers.map(() => '1fr').join(' ')}">${header}${rows}</div>
  </div>`;
}

function renderOverviewTrendsChart(papers, journalPapers) {
  if (trendsMode === 'alluvial') return renderAlluvialChart(papers, overviewTrendsYearMin, overviewTrendsYearMax);
  if (trendsMode === 'heatmap') return renderHeatmapChart(journalPapers);
  return renderTrendsChartHtml(papers, trendsMode);
}

function getOverviewTrendsPapers() {
  const seen = new Set();
  const papers = [];
  for (const pub of publishers) {
    for (const journal of pub.journals) {
      const data = dataCache[journal.id];
      if (!data) continue;
      for (const key of overviewTrendsSections) {
        for (const paper of (data.sections?.[key] || [])) {
          if (paper.doi && !seen.has(paper.doi)) {
            seen.add(paper.doi);
            papers.push(paper);
          }
        }
      }
    }
  }
  return papers;
}

function getOverviewPapersByJournal() {
  const result = [];
  for (const pub of publishers) {
    for (const journal of pub.journals) {
      const data = dataCache[journal.id];
      if (!data) continue;
      result.push({ journal, papers: collectPapersFromSections(data, overviewTrendsSections) });
    }
  }
  return result;
}

function allJournals() {
  return publishers.flatMap(p => p.journals);
}

function latestUpdatedAt() {
  return allJournals().map(j => dataCache[j.id]?.updated_at).filter(Boolean).sort().pop();
}

// ── Overview ─────────────────────────────────────────────────────────────────

async function renderOverview(seq) {
  activeJournalId = null;
  activePublisherId = null;

  setActivePublisherTab(null);
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });

  document.getElementById('overview-btn')?.classList.add('active');
  document.getElementById('journal-tabs').innerHTML = '';
  document.documentElement.style.setProperty('--journal-color', 'var(--accent)');

  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading overview…</p></div>`;

  await loadAllJournals();
  if (seq !== renderSeq) return;

  // Build per-section aggregates for the top-papers cards
  const bySection = { most_cited: [], trending: [], latest: [] };
  const seenPerSection = { most_cited: new Set(), trending: new Set(), latest: new Set() };
  for (const journal of allJournals()) {
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

  const overviewData = {
    trending_from: allJournals().map(j => dataCache[j.id]?.trending_from).find(Boolean),
    sections: {
      most_cited: bySection.most_cited.sort(byCitations).slice(0, 50),
      trending:   bySection.trending.sort(byTrend).slice(0, 50),
      latest:     bySection.latest.sort(byNewest).slice(0, 50),
    },
  };
  dataCache['_overview'] = overviewData;
  setLastUpdated(latestUpdatedAt());

  const accentColor = 'var(--accent)';
  const totalJournals = allJournals().length;

  function trendsSubText(papers) {
    const n = papers.length;
    if (trendsMode === 'clusters') return `Topics clustered by co-occurrence — ${n} papers`;
    if (trendsMode === 'alluvial') return `Topic flow across years — ${n} papers (enable "Most Cited" for longer history)`;
    if (trendsMode === 'heatmap')  return `Topic frequency across all journals`;
    return `Most frequent AI-generated topic keywords — ${n} papers`;
  }

  const trendsPapers    = getOverviewTrendsPapers();
  const papersByJournal = getOverviewPapersByJournal();

  main.innerHTML = `
    <div class="overview-view">
      <div class="overview-header">
        <h2 class="overview-title">All Journals — Overview</h2>
        <p class="overview-sub">Top papers across all ${totalJournals} journals &nbsp;·&nbsp; <button class="trends-anchor-btn" id="trends-anchor-btn">Keyword Trends ↓</button></p>
      </div>
      <div class="sections-grid">
        ${renderLatestSection(overviewData, accentColor)}
        ${renderCiteSection(overviewData, '_overview', accentColor)}
      </div>
      <div class="trends-section" id="trends-section">
        <div class="trends-header">
          <h2 class="trends-title">Keyword Trends</h2>
          <p class="trends-sub" id="trends-sub">${trendsSubText(trendsPapers)}</p>
          <div class="trends-header-controls">
            <div class="trends-toggle" role="group" aria-label="Trend source">
              <button class="trends-toggle-btn ${trendsMode === 'openalex_keywords' ? 'active' : ''}" data-mode="openalex_keywords">AI Keywords</button>
              <button class="trends-toggle-btn ${trendsMode === 'alluvial'          ? 'active' : ''}" data-mode="alluvial">Topic Flow</button>
              <button class="trends-toggle-btn ${trendsMode === 'heatmap'           ? 'active' : ''}" data-mode="heatmap">Heatmap</button>
              <button class="trends-toggle-btn ${trendsMode === 'clusters'          ? 'active' : ''}" data-mode="clusters">Topic Clusters</button>
            </div>
            <div class="trends-controls-row">
              ${renderSectionFilterHtml(overviewTrendsSections)}
              <div id="overview-year-range">${trendsMode === 'alluvial' ? renderYearRangeHtml(trendsPapers, overviewTrendsYearMin, overviewTrendsYearMax) : ''}</div>
            </div>
          </div>
        </div>
        <div class="trends-chart" id="trends-chart">${renderOverviewTrendsChart(trendsPapers, papersByJournal)}</div>
      </div>
    </div>
  `;

  bindToggleButtons({}, { color: accentColor });

  document.getElementById('trends-anchor-btn')?.addEventListener('click', () => {
    document.getElementById('trends-section')?.scrollIntoView({ behavior: 'smooth' });
  });

  function refreshOverviewTrends() {
    const papers    = getOverviewTrendsPapers();
    const byJournal = getOverviewPapersByJournal();
    document.getElementById('trends-sub').textContent = trendsSubText(papers);
    document.getElementById('trends-chart').innerHTML  = renderOverviewTrendsChart(papers, byJournal);
    const yrEl = document.getElementById('overview-year-range');
    if (yrEl) yrEl.innerHTML = trendsMode === 'alluvial' ? renderYearRangeHtml(papers, overviewTrendsYearMin, overviewTrendsYearMax) : '';
    bindOverviewYearRange();
  }

  function refreshOverviewChart() {
    document.getElementById('trends-chart').innerHTML =
      renderOverviewTrendsChart(getOverviewTrendsPapers(), getOverviewPapersByJournal());
  }

  function bindOverviewYearRange() {
    document.getElementById('year-min-select')?.addEventListener('change', e => {
      overviewTrendsYearMin = e.target.value ? Number(e.target.value) : null;
      refreshOverviewChart();
    });
    document.getElementById('year-max-select')?.addEventListener('change', e => {
      overviewTrendsYearMax = e.target.value ? Number(e.target.value) : null;
      refreshOverviewChart();
    });
  }

  main.querySelectorAll('.trends-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (trendsMode === btn.dataset.mode) return;
      trendsMode = btn.dataset.mode;
      overviewTrendsYearMin = null;
      overviewTrendsYearMax = null;
      main.querySelectorAll('.trends-toggle-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === trendsMode)
      );
      refreshOverviewTrends();
    });
  });

  main.querySelectorAll('#trends-section .section-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = btn.dataset.section;
      const isActive = overviewTrendsSections.has(sec);
      if (isActive && overviewTrendsSections.size === 1) return;
      if (isActive) overviewTrendsSections.delete(sec);
      else overviewTrendsSections.add(sec);
      btn.classList.toggle('active', !isActive);
      overviewTrendsYearMin = null;
      overviewTrendsYearMax = null;
      refreshOverviewTrends();
    });
  });

  bindOverviewYearRange();
}

let overviewTrendsSections = new Set(['trending', 'latest']);
let overviewTrendsYearMin = null;
let overviewTrendsYearMax = null;
let journalTrendsMode = 'alluvial';
let journalTrendsSections = new Set(['most_cited', 'trending', 'latest']);
let journalTrendsYearMin = null;
let journalTrendsYearMax = null;
let trendsMode = 'openalex_keywords';

function renderTrendsChartHtml(papers, mode = trendsMode) {
  if (mode === 'clusters') {
    const clusters = extractTopicClusters(papers);
    if (clusters.length === 0) return '<div class="empty-card">No data available.</div>';
    return `<div class="cluster-grid">${clusters.map(c => `
      <button class="cluster-card" data-search="${escapeHtml(c.keywords[0])}">
        <span class="cluster-name">${escapeHtml(c.name)}</span>
        <span class="cluster-count">${c.count} papers</span>
        <div class="cluster-keywords">${c.keywords.map(k =>
          `<span class="cluster-kw">${escapeHtml(k)}</span>`
        ).join('')}</div>
      </button>
    `).join('')}</div>`;
  }

  const items = mode === 'title_words'
    ? extractTopWords(papers)
    : extractTopKeywords(papers);
  if (items.length === 0) return '<div class="empty-card">No data available.</div>';
  const maxCount = items[0].count;
  const rows = items.map(({ word, count }) => {
    const pct = Math.round((count / maxCount) * 100);
    return `
      <div class="chart-row">
        <button class="chart-label" data-search="${escapeHtml(word)}">${escapeHtml(word)}</button>
        <div class="chart-bar-wrap">
          <div class="chart-bar" style="width:${pct}%">
            <span class="chart-count">${count}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  return `<div class="chart-bars">${rows}</div>`;
}


// ── Search ───────────────────────────────────────────────────────────────────

let searchDebounce = null;
let searchState = null;   // { params, terms, results, sectionCounts, shown }
let searchIndex = [];     // one entry per unique DOI across all journals
let searchIndexKey = '';  // which journals the index was built from
let searchYears = [];

const SEARCH_PAGE = 20;

const SEARCH_FILTERS = [
  { key: 'all',        label: 'All' },
  { key: 'most_cited', label: 'Most Cited' },
  { key: 'trending',   label: 'Trending' },
  { key: 'latest',     label: 'Latest' },
];

const SEARCH_SORTS = [
  ['relevance', 'Relevance'],
  ['citations', 'Most cited'],
  ['newest',    'Newest'],
];

// Relevance weight of a match in: title, authors, topics, abstract
const FIELD_WEIGHTS = [3, 2, 3, 1];

function initSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const q = input.value.trim();
    searchDebounce = setTimeout(() => {
      if (!q) {
        if (currentRoute.view === 'search') navigate(lastBrowseRoute);
        return;
      }
      // Typing refines the current search in place; filters are kept
      const inSearch = currentRoute.view === 'search';
      navigate({ ...SEARCH_DEFAULTS, ...(inSearch ? currentRoute : {}), view: 'search', q }, { replace: inSearch });
    }, q ? 250 : 0);
  });
}

// Words and "quoted phrases", lowercased and deduplicated
function parseSearchTerms(q) {
  const terms = [];
  for (const m of q.matchAll(/"([^"]+)"|(\S+)/g)) {
    const term = (m[1] ?? m[2]).replace(/"/g, '').trim().toLowerCase();
    if (term && !terms.includes(term)) terms.push(term);
  }
  return terms;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matches at the start of a word, so "ai" finds "AI ethics" but not "said"
function termRegex(term, flags = 'iu') {
  return new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(term)})`, flags);
}

function highlightText(text, terms) {
  if (!text) return '';
  if (!terms?.length) return escapeHtml(text);
  const ranges = [];
  for (const term of terms) {
    for (const m of text.matchAll(termRegex(term, 'giu'))) {
      const start = m.index + m[1].length;
      ranges.push([start, start + m[2].length]);
    }
  }
  if (!ranges.length) return escapeHtml(text);
  ranges.sort((a, b) => a[0] - b[0]);
  let html = '', pos = 0;
  for (const [start, end] of ranges) {
    if (end <= pos) continue;
    const from = Math.max(start, pos);
    html += escapeHtml(text.slice(pos, from)) + `<mark>${escapeHtml(text.slice(from, end))}</mark>`;
    pos = end;
  }
  return html + escapeHtml(text.slice(pos));
}

// Shows where a term matched when it only appears in the abstract
function renderAbstractSnippet(paper, terms) {
  const abstract = paper.abstract;
  if (!abstract || !terms.length) return '';
  const visible = [paper.title, ...(paper.authors || []), ...(paper.topics || [])].join(' · ');
  const term = terms.find(t => !termRegex(t).test(visible) && termRegex(t).test(abstract));
  if (!term) return '';
  const m = termRegex(term).exec(abstract);
  const hit = m.index + m[1].length;
  let start = Math.max(0, hit - 90);
  if (start > 0) {
    const space = abstract.indexOf(' ', start);
    if (space !== -1 && space < hit) start = space + 1;
  }
  let end = Math.min(abstract.length, hit + 160);
  if (end < abstract.length) {
    const space = abstract.lastIndexOf(' ', end);
    if (space > hit) end = space;
  }
  return `<p class="search-snippet">${start > 0 ? '…' : ''}${highlightText(abstract.slice(start, end), terms)}${end < abstract.length ? '…' : ''}</p>`;
}

function ensureSearchIndex() {
  const key = allJournals().filter(j => dataCache[j.id]).map(j => j.id).join(',');
  if (key === searchIndexKey) return;
  searchIndexKey = key;
  const entries = new Map();
  for (const journal of allJournals()) {
    const data = dataCache[journal.id];
    if (!data) continue;
    for (const [sectionKey, papers] of Object.entries(data.sections || {})) {
      for (const paper of papers) {
        if (!paper.doi) continue;
        const doi = paper.doi.toLowerCase();
        let entry = entries.get(doi);
        if (!entry) {
          entry = {
            paper: paperIndex.get(doi) || { ...paper, _journalName: journal.name },
            journalId: journal.id,
            sections: new Set(),
            fields: [
              paper.title || '',
              (paper.authors || []).join(' · '),
              (paper.topics || []).join(' · '),
              paper.abstract || '',
            ],
          };
          entries.set(doi, entry);
        }
        entry.sections.add(sectionKey);
      }
    }
  }
  searchIndex = [...entries.values()];
  searchYears = [...new Set(searchIndex.map(e => e.paper.year).filter(Boolean))].sort((a, b) => b - a);
}

// Every term must match somewhere; the score sums the weights of the fields each term matched
function scoreEntry(entry, regexes) {
  let score = 0;
  for (const re of regexes) {
    let termScore = 0;
    entry.fields.forEach((field, i) => { if (re.test(field)) termScore += FIELD_WEIGHTS[i]; });
    if (!termScore) return 0;
    score += termScore;
  }
  return score || 1;
}

function computeSearchResults(params) {
  const terms = parseSearchTerms(params.q);
  const regexes = terms.map(t => termRegex(t));
  const from = Number(params.from) || null;
  const to = Number(params.to) || null;

  const matches = [];
  for (const entry of searchIndex) {
    if (params.journal && entry.journalId !== params.journal) continue;
    const year = entry.paper.year;
    if (from && !(year >= from)) continue;
    if (to && !(year <= to)) continue;
    const score = scoreEntry(entry, regexes);
    if (score) matches.push({ entry, score });
  }

  const sectionCounts = { all: matches.length };
  for (const { key } of SEARCH_FILTERS.slice(1)) {
    sectionCounts[key] = matches.filter(r => r.entry.sections.has(key)).length;
  }
  const results = params.section === 'all'
    ? [...matches]
    : matches.filter(r => r.entry.sections.has(params.section));

  const compare = {
    citations: (a, b) => byCitations(a.entry.paper, b.entry.paper),
    newest:    (a, b) => byNewest(a.entry.paper, b.entry.paper),
  }[params.sort] || ((a, b) => b.score - a.score || byCitations(a.entry.paper, b.entry.paper));
  results.sort(compare);

  return { terms, results, sectionCounts };
}

async function performSearch(params, seq) {
  // Results span all journals, so no publisher or journal tab stays highlighted
  setActivePublisherTab(null);
  setActiveJournalTab(null);
  document.getElementById('overview-btn')?.classList.remove('active');
  const main = document.getElementById('main-content');
  if (!allJournals().every(j => dataCache[j.id])) {
    main.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Searching across all journals…</p></div>`;
  }

  await loadAllJournals();
  if (seq !== renderSeq) return;

  ensureSearchIndex();
  searchState = { params, ...computeSearchResults(params), shown: SEARCH_PAGE };
  main.innerHTML = renderSearchResults();
}

function renderSearchCards(start, end) {
  return searchState.results.slice(start, end).map(({ entry }, i) => `
    <div class="search-result-item">
      <div class="search-journal-label">${escapeHtml(entry.paper._journalName)}</div>
      ${renderCard(entry.paper, start + i + 1, { terms: searchState.terms })}
    </div>
  `).join('');
}

function renderSearchMoreButton() {
  const remaining = searchState.results.length - searchState.shown;
  return remaining > 0
    ? `<button class="show-more-btn search-more-btn">Show ${Math.min(SEARCH_PAGE, remaining)} more</button>`
    : '';
}

function showMoreSearchResults(btn) {
  const start = searchState.shown;
  searchState.shown += SEARCH_PAGE;
  btn.closest('.search-results').querySelector('.search-cards')
    .insertAdjacentHTML('beforeend', renderSearchCards(start, searchState.shown));
  const more = renderSearchMoreButton();
  if (more) btn.outerHTML = more;
  else btn.remove();
}

function renderSearchResults() {
  const { params, results, sectionCounts } = searchState;

  const tabsHtml = SEARCH_FILTERS.map(f => {
    const isActive = params.section === f.key;
    return `<button class="search-filter-btn ${isActive ? 'active' : ''}" data-filter="${f.key}">
      ${f.label}<span class="search-filter-count">${sectionCounts[f.key]}</span>
    </button>`;
  }).join('');

  const journalOptions = publishers.map(pub => `<optgroup label="${escapeHtml(pub.name)}">${pub.journals.map(j =>
    `<option value="${escapeHtml(j.id)}" ${params.journal === j.id ? 'selected' : ''}>${escapeHtml(j.name)}</option>`
  ).join('')}</optgroup>`).join('');
  const yearOptions = (selected, label) => `<option value="">${label}</option>` + searchYears.map(y =>
    `<option value="${y}" ${String(y) === String(selected) ? 'selected' : ''}>${y}</option>`
  ).join('');
  const sortOptions = SEARCH_SORTS.map(([key, label]) =>
    `<option value="${key}" ${params.sort === key ? 'selected' : ''}>${label}</option>`
  ).join('');

  const journalName = allJournals().find(j => j.id === params.journal)?.name;
  const scope = journalName ? `in ${escapeHtml(journalName)}` : 'across all journals';
  const matching = params.q ? ` matching <em>"${escapeHtml(params.q)}"</em>` : '';

  const header = `
    <div class="search-results-header">
      <div class="search-results-count">
        ${results.length} paper${results.length !== 1 ? 's' : ''}${matching} ${scope}
      </div>
      <div class="search-filter-tabs" role="group" aria-label="Filter results">${tabsHtml}</div>
      <div class="search-controls">
        <select class="year-range-select" data-param="journal" aria-label="Journal">
          <option value="">All journals</option>${journalOptions}
        </select>
        <div class="year-range-filter">
          <span class="year-range-label">Years</span>
          <select class="year-range-select" data-param="from" aria-label="From year">${yearOptions(params.from, 'From')}</select>
          <span class="year-range-sep">–</span>
          <select class="year-range-select" data-param="to" aria-label="To year">${yearOptions(params.to, 'To')}</select>
        </div>
        <label class="year-range-filter">
          <span class="year-range-label">Sort</span>
          <select class="year-range-select" data-param="sort">${sortOptions}</select>
        </label>
      </div>
    </div>
  `;

  if (results.length === 0) {
    const msg = sectionCounts.all === 0
      ? 'No papers found. Try fewer or different keywords, or remove filters.'
      : 'No papers in this section match your query.';
    return `<div class="search-results">${header}<div class="empty-card" style="margin-top:1rem">${msg}</div></div>`;
  }

  return `<div class="search-results">${header}<div class="search-cards">${renderSearchCards(0, searchState.shown)}</div>${renderSearchMoreButton()}</div>`;
}

function updateSearchParams(changes) {
  if (currentRoute.view !== 'search') return;
  navigate({ ...currentRoute, ...changes }, { replace: true });
}

// ── Data loading ─────────────────────────────────────────────────────────────

const journalRequests = {}; // journal id → in-flight fetch, shared by concurrent callers

function fetchJournalData(journal) {
  if (dataCache[journal.id]) return Promise.resolve(dataCache[journal.id]);
  if (!journalRequests[journal.id]) {
    journalRequests[journal.id] = fetch(`data/${journal.id}.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        dataCache[journal.id] = data;
        indexJournalData(data, journal.name);
        return data;
      })
      .finally(() => { delete journalRequests[journal.id]; });
  }
  return journalRequests[journal.id];
}

function loadAllJournals() {
  return Promise.allSettled(allJournals().map(fetchJournalData));
}

function indexJournalData(data, journalName) {
  for (const section of Object.values(data.sections || {})) {
    for (const paper of section) {
      if (paper.doi && !paperIndex.has(paper.doi.toLowerCase())) {
        paperIndex.set(paper.doi.toLowerCase(), { ...paper, _journalName: journalName });
      }
    }
  }
}

// ── Routing ──────────────────────────────────────────────────────────────────
//   (no hash)                overview
//   #/journal/<id>           journal view
//   #/search?q=…&section=…&journal=…&from=…&to=…&sort=…

const SEARCH_DEFAULTS = { q: '', section: 'all', journal: '', from: '', to: '', sort: 'relevance' };

let currentRoute = { view: 'overview' };
let lastBrowseRoute = { view: 'overview' }; // where clearing the search box returns to
let renderSeq = 0;                          // async renders bail out when a newer route started
let renderedHash = null;

function parseRoute(hash = location.hash) {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'journal' && parts[1]) return { view: 'journal', journalId: parts[1] };
  if (parts[0] === 'search') {
    const params = new URLSearchParams(query);
    const route = { view: 'search' };
    for (const [key, fallback] of Object.entries(SEARCH_DEFAULTS)) route[key] = params.get(key) ?? fallback;
    return route;
  }
  return { view: 'overview' };
}

function routeToHash(route) {
  if (route.view === 'journal') return `#/journal/${encodeURIComponent(route.journalId)}`;
  if (route.view === 'search') {
    const params = new URLSearchParams();
    for (const [key, fallback] of Object.entries(SEARCH_DEFAULTS)) {
      if (route[key] && route[key] !== fallback) params.set(key, route[key]);
    }
    const query = params.toString();
    return `#/search${query ? `?${query}` : ''}`;
  }
  return '';
}

function navigate(route, { replace = false } = {}) {
  const hash = routeToHash(route);
  if (hash !== location.hash) {
    history[replace ? 'replaceState' : 'pushState'](null, '', hash || location.pathname + location.search);
  }
  renderRoute(route);
}

function searchFor(query) {
  navigate({ ...SEARCH_DEFAULTS, view: 'search', q: query });
}

function renderRoute(route) {
  const seq = ++renderSeq;
  closePaperModal();
  const input = document.getElementById('search-input');

  if (route.view === 'search') {
    currentRoute = route;
    renderedHash = location.hash;
    if (input && input.value.trim() !== route.q) input.value = route.q;
    performSearch(route, seq);
    return;
  }

  clearTimeout(searchDebounce);
  if (input) input.value = '';

  if (route.view === 'journal') {
    const publisher = publishers.find(p => p.journals.some(j => j.id === route.journalId));
    const journal = publisher?.journals.find(j => j.id === route.journalId);
    if (journal) {
      currentRoute = lastBrowseRoute = route;
      renderedHash = location.hash;
      showJournal(journal, publisher, seq);
      return;
    }
    // Unknown journal id in the URL: fall back to the overview
    history.replaceState(null, '', location.pathname + location.search);
  }

  currentRoute = lastBrowseRoute = { view: 'overview' };
  renderedHash = location.hash;
  renderOverview(seq);
}

function initNavigation() {
  // popstate covers back/forward; hashchange covers hand-edited URLs. Both can fire for one change.
  const onLocationChange = () => {
    if (location.hash !== renderedHash) renderRoute(parseRoute());
  };
  window.addEventListener('popstate', onLocationChange);
  window.addEventListener('hashchange', onLocationChange);

  document.addEventListener('click', e => {
    const chip = e.target.closest('.topic-chip[data-topic]');
    if (chip) { searchFor(chip.dataset.topic); return; }

    const trendLink = e.target.closest('[data-search]');
    if (trendLink) {
      searchFor(trendLink.dataset.search);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const filterBtn = e.target.closest('.search-filter-btn[data-filter]');
    if (filterBtn) updateSearchParams({ section: filterBtn.dataset.filter });
  });

  document.addEventListener('change', e => {
    const select = e.target.closest('.search-results select[data-param]');
    if (select) updateSearchParams({ [select.dataset.param]: select.value });
  });

  document.getElementById('overview-btn')?.addEventListener('click', () => navigate({ view: 'overview' }));
}

// ── App State ────────────────────────────────────────────────────────────────

let publishers = [];
let activePublisherId = null;
let activeJournalId = null;

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
    initSubscribe();
    initSearch();
    initModal();
    initNavigation();
    renderRoute(parseRoute());
  } catch (err) {
    showError(`Failed to load journal config: ${err.message}`);
  }
}

// ── RSS feeds ────────────────────────────────────────────────────────────────

// Feed files are written weekly by scripts/build_feeds.py
function initSubscribe() {
  const btn = document.getElementById('subscribe-btn');
  const panel = document.getElementById('subscribe-panel');
  const list = document.getElementById('subscribe-list');
  if (!btn || !panel || !list) return;

  const feeds = [
    { file: 'all.xml', label: 'All journals', title: 'All journals', count: allJournals().length },
    ...publishers.map(p => ({ file: `${p.id}.xml`, label: p.name, title: p.full_name, count: p.journals.length })),
  ];
  list.innerHTML = feeds.map(feed => {
    const url = new URL(`feeds/${feed.file}`, location.href).href;
    return `<li class="subscribe-item">
      <a class="subscribe-name" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${escapeHtml(feed.title)}">${escapeHtml(feed.label)}</a>
      <span class="subscribe-count">${feed.count} journal${feed.count !== 1 ? 's' : ''}</span>
      <button class="subscribe-copy" data-url="${escapeHtml(url)}">Copy link</button>
    </li>`;
  }).join('');

  const setOpen = open => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => setOpen(panel.hidden));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });

  list.addEventListener('click', e => {
    const copy = e.target.closest('.subscribe-copy');
    if (!copy) return;
    const url = copy.dataset.url;
    // The clipboard API needs a secure context; fall back to a prompt the user can copy from
    (navigator.clipboard?.writeText(url) ?? Promise.reject())
      .then(() => {
        copy.textContent = 'Copied ✓';
        setTimeout(() => { copy.textContent = 'Copy link'; }, 1500);
      })
      .catch(() => window.prompt('Copy this feed link:', url));
  });
}

// ── Publisher tabs ────────────────────────────────────────────────────────────

function renderPublisherTabs() {
  const nav = document.getElementById('publisher-tabs');
  const overviewBtn = `
    <button
      class="publisher-btn"
      role="tab"
      id="overview-btn"
      style="--pub-color: var(--accent)"
      aria-selected="false"
      aria-label="Overview across all journals"
    >
      <span class="pub-name">Overview</span>
    </button>
  `;
  const pubBtns = publishers.map(p => `
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
  nav.innerHTML = overviewBtn + pubBtns;

  nav.querySelectorAll('.publisher-btn[data-publisher-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const pub = publishers.find(p => p.id === btn.dataset.publisherId);
      if (pub?.journals[0]) navigate({ view: 'journal', journalId: pub.journals[0].id });
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
    btn.addEventListener('click', () => navigate({ view: 'journal', journalId: btn.dataset.journalId }));
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

// ── Journal view ──────────────────────────────────────────────────────────────

async function showJournal(journal, publisher, seq) {
  activePublisherId = publisher.id;
  activeJournalId = journal.id;

  document.getElementById('overview-btn')?.classList.remove('active');
  setActivePublisherTab(publisher.id);
  renderJournalTabs(publisher);
  setActiveJournalTab(journal.id);
  document.documentElement.style.setProperty('--journal-color', publisher.color);

  const main = document.getElementById('main-content');
  if (!dataCache[journal.id]) {
    main.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading ${escapeHtml(journal.short)} data…</p></div>`;
  }

  let data;
  try {
    data = await fetchJournalData(journal);
  } catch (err) {
    if (seq === renderSeq) {
      main.innerHTML = `<div class="error-state">⚠ Failed to load ${escapeHtml(journal.name)}: ${escapeHtml(err.message)}</div>`;
    }
    return;
  }
  if (seq !== renderSeq) return;

  journalTrendsYearMin = null;
  journalTrendsYearMax = null;
  main.innerHTML = renderJournalView(journal, publisher, data);
  setLastUpdated(data.updated_at);
  bindToggleButtons(journal, publisher);
  bindJournalTrendsEvents(data, journal, publisher);
}

function bindToggleButtons(journal, publisher) {
  document.querySelectorAll('.cite-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      const journalId = btn.dataset.journal;
      const data = dataCache[journalId];
      if (!data) return;
      if ((citeModeState[journalId] || defaultCiteMode(data)) === mode) return;
      citeModeState[journalId] = mode;
      const col = document.getElementById(`cite-section-${journalId}`);
      if (col) col.outerHTML = renderCiteSection(data, journalId, publisher.color);
      bindToggleButtons(journal, publisher);
    });
  });
}

function bindJournalTrendsEvents(data, _journal, _publisher) {
  const section = document.getElementById('journal-trends-section');
  if (!section) return;

  document.getElementById('journal-trends-anchor-btn')?.addEventListener('click', () => {
    section.scrollIntoView({ behavior: 'smooth' });
  });

  section.querySelectorAll('.journal-trends-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (journalTrendsMode === btn.dataset.jmode) return;
      journalTrendsMode = btn.dataset.jmode;
      journalTrendsYearMin = null;
      journalTrendsYearMax = null;
      section.querySelectorAll('.journal-trends-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.jmode === journalTrendsMode)
      );
      refreshJournalTrendsControls(data);
      refreshJournalTrendsChart(data);
    });
  });

  bindJournalSectionFilter(data);
  bindJournalYearRange(data);
}

function bindJournalSectionFilter(data) {
  document.querySelectorAll('#journal-trends-controls .section-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = btn.dataset.section;
      const isActive = journalTrendsSections.has(sec);
      if (isActive && journalTrendsSections.size === 1) return; // keep at least one
      if (isActive) journalTrendsSections.delete(sec);
      else journalTrendsSections.add(sec);
      btn.classList.toggle('active', !isActive);
      journalTrendsYearMin = null;
      journalTrendsYearMax = null;
      refreshJournalTrendsControls(data);
      refreshJournalTrendsChart(data);
    });
  });
}

function bindJournalYearRange(data) {
  document.getElementById('year-min-select')?.addEventListener('change', e => {
    journalTrendsYearMin = e.target.value ? Number(e.target.value) : null;
    refreshJournalTrendsChart(data);
  });
  document.getElementById('year-max-select')?.addEventListener('change', e => {
    journalTrendsYearMax = e.target.value ? Number(e.target.value) : null;
    refreshJournalTrendsChart(data);
  });
}

function showError(msg) {
  document.getElementById('main-content').innerHTML =
    `<div class="error-state">⚠ ${escapeHtml(msg)}</div>`;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
