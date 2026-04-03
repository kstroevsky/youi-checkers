/**
 * Generates a self-contained HTML performance dashboard from perf-report.json.
 *
 * All charts are rendered as inline SVG — no external dependencies, no CDN.
 *
 * Usage (standalone):
 *   node scripts/perf-charts.mjs [--input=path/to/perf-report.json] [--output=path/to/perf-charts.html]
 *
 * Called automatically at the end of `npm run perf:report`.
 */

/* global console, process */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const defaultInput = path.join(rootDir, 'output', 'playwright', 'perf-report.json');
const defaultOutput = path.join(rootDir, 'output', 'playwright', 'perf-charts.html');

function parseArg(name) {
  const prefix = `--${name}=`;
  const entry = process.argv.find((a) => a.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
}

// ── Palette ──────────────────────────────────────────────────────────────────

const C = {
  easy: '#4caf50',
  medium: '#ff9800',
  hard: '#f44336',
  desktop: '#1e88e5',
  mobile: '#8e24aa',
  baseline: '#90a4ae',
  optimized: '#00acc1',
  gain: '#7cb342',
  domain: '#546e7a',
  single: '#5c6bc0',
  throttle4x: '#fb8c00',
  throttle6x: '#e53935',
};

// ── Math helpers ─────────────────────────────────────────────────────────────

function niceMax(raw, steps = 5) {
  if (!raw || raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw / steps)));
  const norm = raw / (steps * mag);
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * steps * mag;
}

function niceTicks(max, count = 5) {
  const step = max / count;
  return Array.from({ length: count + 1 }, (_, i) => +(i * step).toPrecision(4));
}

// ── Label formatters ─────────────────────────────────────────────────────────

function fmtVal(v, unit) {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'n/a';
  if (unit === 'ms') {
    return v < 1 ? `${(v * 1000).toFixed(0)}µs` : v < 10 ? `${v.toFixed(2)}ms` : `${Math.round(v)}ms`;
  }
  if (unit === 'nps') {
    return v >= 10_000 ? `${(v / 1000).toFixed(0)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
  }
  if (unit === '%') return `${v.toFixed(1)}%`;
  return v < 1 ? v.toFixed(3) : v < 100 ? v.toFixed(2) : String(Math.round(v));
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── SVG line chart ────────────────────────────────────────────────────────────
// datasets: [{label, values: (number|null)[], color}]

function svgLineChart({ title, xLabels, datasets, yUnit = '', yLabel = '', width = 620, height = 270 }) {
  const mg = { top: 38, right: 28, bottom: 62, left: 68 };
  const pw = width - mg.left - mg.right;
  const ph = height - mg.top - mg.bottom;

  const allVals = datasets.flatMap((d) => d.values).filter((v) => v !== null && Number.isFinite(v));
  if (!allVals.length) {
    return `<svg width="${width}" height="${height}"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#aaa" font-size="13">No data</text></svg>`;
  }

  const yMax = niceMax(Math.max(...allVals));
  const ticks = niceTicks(yMax);
  const n = xLabels.length;
  const xOf = (i) => mg.left + (n > 1 ? (i / (n - 1)) * pw : pw / 2);
  const yOf = (v) => mg.top + ph - (v / yMax) * ph;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="font-family:system-ui,sans-serif;font-size:11px;overflow:visible">`;

  // Title
  s += `<text x="${width / 2}" y="22" text-anchor="middle" font-weight="600" font-size="13" fill="#1a1a1a">${esc(title)}</text>`;

  // Y-axis label
  if (yLabel) {
    s += `<text transform="rotate(-90)" x="${-(mg.top + ph / 2)}" y="13" text-anchor="middle" fill="#777" font-size="10">${esc(yLabel || yUnit)}</text>`;
  }

  // Grid + Y ticks
  for (const t of ticks) {
    const y = yOf(t);
    s += `<line x1="${mg.left}" y1="${y}" x2="${mg.left + pw}" y2="${y}" stroke="#ebebeb" stroke-width="1"/>`;
    s += `<text x="${mg.left - 6}" y="${y + 4}" text-anchor="end" fill="#888">${fmtVal(t, yUnit)}</text>`;
  }

  // X axis ticks + labels (rotate if many)
  const rotate = xLabels.length > 5;
  for (let i = 0; i < n; i++) {
    const x = xOf(i);
    s += `<line x1="${x}" y1="${mg.top + ph}" x2="${x}" y2="${mg.top + ph + 5}" stroke="#ccc"/>`;
    if (rotate) {
      s += `<text transform="rotate(-35,${x},${mg.top + ph + 10})" x="${x}" y="${mg.top + ph + 10}" text-anchor="end" fill="#555">${esc(xLabels[i])}</text>`;
    } else {
      s += `<text x="${x}" y="${mg.top + ph + 18}" text-anchor="middle" fill="#555">${esc(xLabels[i])}</text>`;
    }
  }

  // Axes
  s += `<line x1="${mg.left}" y1="${mg.top}" x2="${mg.left}" y2="${mg.top + ph}" stroke="#bbb"/>`;
  s += `<line x1="${mg.left}" y1="${mg.top + ph}" x2="${mg.left + pw}" y2="${mg.top + ph}" stroke="#bbb"/>`;

  // Lines (draw separate segments around nulls)
  for (const ds of datasets) {
    let seg = [];
    for (let i = 0; i <= ds.values.length; i++) {
      const v = ds.values[i];
      if (i < ds.values.length && v !== null && Number.isFinite(v)) {
        seg.push(`${xOf(i)},${yOf(v)}`);
      } else {
        if (seg.length >= 2) {
          s += `<polyline points="${seg.join(' ')}" fill="none" stroke="${ds.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
        }
        seg = [];
      }
    }
    // Points
    ds.values.forEach((v, i) => {
      if (v !== null && Number.isFinite(v)) {
        s += `<circle cx="${xOf(i)}" cy="${yOf(v)}" r="4" fill="${ds.color}" stroke="white" stroke-width="1.5"/>`;
        // Value label above point (only when few data points)
        if (n <= 6) {
          s += `<text x="${xOf(i)}" y="${yOf(v) - 8}" text-anchor="middle" fill="${ds.color}" font-size="10" font-weight="500">${fmtVal(v, yUnit)}</text>`;
        }
      }
    });
  }

  // Legend (bottom)
  const legY = height - 12;
  const perItem = Math.min(150, pw / datasets.length);
  const legX0 = mg.left + (pw - perItem * datasets.length) / 2;
  datasets.forEach((ds, i) => {
    const lx = legX0 + i * perItem;
    s += `<line x1="${lx}" y1="${legY - 4}" x2="${lx + 14}" y2="${legY - 4}" stroke="${ds.color}" stroke-width="2.5" stroke-linecap="round"/>`;
    s += `<circle cx="${lx + 7}" cy="${legY - 4}" r="3" fill="${ds.color}" stroke="white" stroke-width="1"/>`;
    s += `<text x="${lx + 20}" y="${legY}" fill="#555">${esc(ds.label)}</text>`;
  });

  s += `</svg>`;
  return s;
}

// ── SVG grouped bar chart ─────────────────────────────────────────────────────

function svgBarChart({ title, xLabels, datasets, yUnit = '', width = 620, height = 270 }) {
  const mg = { top: 38, right: 28, bottom: 62, left: 68 };
  const pw = width - mg.left - mg.right;
  const ph = height - mg.top - mg.bottom;

  const allVals = datasets.flatMap((d) => d.values).filter((v) => v !== null && Number.isFinite(v));
  if (!allVals.length) {
    return `<svg width="${width}" height="${height}"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#aaa" font-size="13">No data</text></svg>`;
  }

  const yMax = niceMax(Math.max(...allVals));
  const ticks = niceTicks(yMax);
  const n = xLabels.length;
  const groupW = pw / n;
  const pad = groupW * 0.12;
  const barW = (groupW - 2 * pad) / datasets.length;
  const barX = (gi, di) => mg.left + gi * groupW + pad + di * barW;
  const yOf = (v) => mg.top + ph - (v / yMax) * ph;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="font-family:system-ui,sans-serif;font-size:11px">`;

  s += `<text x="${width / 2}" y="22" text-anchor="middle" font-weight="600" font-size="13" fill="#1a1a1a">${esc(title)}</text>`;

  for (const t of ticks) {
    const y = yOf(t);
    s += `<line x1="${mg.left}" y1="${y}" x2="${mg.left + pw}" y2="${y}" stroke="#ebebeb"/>`;
    s += `<text x="${mg.left - 6}" y="${y + 4}" text-anchor="end" fill="#888">${fmtVal(t, yUnit)}</text>`;
  }

  for (let gi = 0; gi < n; gi++) {
    const cx = mg.left + gi * groupW + groupW / 2;
    s += `<text x="${cx}" y="${mg.top + ph + 18}" text-anchor="middle" fill="#555">${esc(xLabels[gi])}</text>`;
  }

  s += `<line x1="${mg.left}" y1="${mg.top}" x2="${mg.left}" y2="${mg.top + ph}" stroke="#bbb"/>`;
  s += `<line x1="${mg.left}" y1="${mg.top + ph}" x2="${mg.left + pw}" y2="${mg.top + ph}" stroke="#bbb"/>`;

  for (let gi = 0; gi < n; gi++) {
    for (let di = 0; di < datasets.length; di++) {
      const v = datasets[di].values[gi];
      if (v === null || !Number.isFinite(v)) continue;
      const x = barX(gi, di);
      const y = yOf(v);
      const bh = mg.top + ph - y;
      s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW - 2).toFixed(1)}" height="${bh.toFixed(1)}" fill="${datasets[di].color}" opacity="0.85" rx="2"/>`;
    }
  }

  const legY = height - 12;
  const perItem = Math.min(150, pw / datasets.length);
  const legX0 = mg.left + (pw - perItem * datasets.length) / 2;
  datasets.forEach((ds, i) => {
    const lx = legX0 + i * perItem;
    s += `<rect x="${lx}" y="${legY - 10}" width="12" height="12" rx="2" fill="${ds.color}" opacity="0.85"/>`;
    s += `<text x="${lx + 17}" y="${legY}" fill="#555">${esc(ds.label)}</text>`;
  });

  s += `</svg>`;
  return s;
}

// ── SVG horizontal bar chart ──────────────────────────────────────────────────

function svgHBarChart({ title, items, xUnit = '', color = C.domain, width = 620 }) {
  const rowH = 30;
  const mg = { top: 38, right: 72, bottom: 28, left: 180 };
  const height = mg.top + items.length * rowH + mg.bottom;
  const pw = width - mg.left - mg.right;

  const vals = items.map((it) => it.value).filter(Number.isFinite);
  if (!vals.length) {
    return `<svg width="${width}" height="${height}"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#aaa">No data</text></svg>`;
  }
  const xMax = niceMax(Math.max(...vals));
  const xTicks = niceTicks(xMax, 4);

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="font-family:system-ui,sans-serif;font-size:11px">`;
  s += `<text x="${width / 2}" y="22" text-anchor="middle" font-weight="600" font-size="13" fill="#1a1a1a">${esc(title)}</text>`;

  for (const t of xTicks) {
    const x = mg.left + (t / xMax) * pw;
    s += `<line x1="${x}" y1="${mg.top}" x2="${x}" y2="${mg.top + items.length * rowH}" stroke="#ebebeb"/>`;
    s += `<text x="${x}" y="${mg.top + items.length * rowH + 14}" text-anchor="middle" fill="#999">${fmtVal(t, xUnit)}</text>`;
  }

  for (let i = 0; i < items.length; i++) {
    const { label, value, color: itemColor } = items[i];
    const y = mg.top + i * rowH;
    const bw = (value / xMax) * pw;
    s += `<text x="${mg.left - 10}" y="${y + rowH / 2 + 4}" text-anchor="end" fill="#333">${esc(label)}</text>`;
    s += `<rect x="${mg.left}" y="${y + 5}" width="${Math.max(0, bw).toFixed(1)}" height="${rowH - 10}" fill="${itemColor ?? color}" opacity="0.82" rx="3"/>`;
    s += `<text x="${mg.left + bw + 6}" y="${y + rowH / 2 + 4}" fill="#555">${fmtVal(value, xUnit)}</text>`;
  }

  s += `</svg>`;
  return s;
}

// ── HTML page builder ─────────────────────────────────────────────────────────

function section(heading, desc, charts) {
  const cells = charts
    .filter(Boolean)
    .map((c) => `<div class="chart-cell">${c}</div>`)
    .join('\n');
  if (!cells) return '';
  return `
<section>
  <h2>${esc(heading)}</h2>
  ${desc ? `<p class="desc">${esc(desc)}</p>` : ''}
  <div class="chart-grid">${cells}</div>
</section>`;
}

function buildHtml(report) {
  const domain = report.domain ?? {};
  const domOps = domain.domain ?? {};
  const ai = domain.ai ?? {};
  const cacheBench = domain.rootOrderingCacheBenchmark ?? [];
  const mobileProfiles = report.mobileProfiles ?? {};
  const throttleKeys = Object.keys(mobileProfiles).sort((a, b) => Number(a) - Number(b));

  // ── Helpers to extract per-position AI metric arrays ────────────────���────
  // States are ordered consistently across difficulties.
  const posLabels = ['hard', 'medium', 'easy'].reduce(
    (acc, d) => (acc.length ? acc : (ai[d]?.states ?? []).map((s) => s.label)),
    [],
  );

  function aiSeries(metric) {
    return ['easy', 'medium', 'hard'].map((d) => ({
      label: d,
      color: C[d],
      values: (ai[d]?.states ?? []).map((s) => {
        const v = s[metric];
        return v !== undefined && v !== null ? v : null;
      }),
    }));
  }

  function aiAggSeries(metric) {
    return ['easy', 'medium', 'hard'].map((d) => ({
      label: d,
      color: C[d],
      values: [ai[d]?.[metric] ?? null],
    }));
  }

  // ── 1. Game progression ───────────────────────────────────────────────────

  const wallTimeChart = svgLineChart({
    title: 'AI Wall Time by Position',
    xLabels: posLabels,
    datasets: aiSeries('wallTimeMs'),
    yUnit: 'ms',
  });

  const npsChart = svgLineChart({
    title: 'Search Throughput by Position (nodes / sec)',
    xLabels: posLabels,
    datasets: aiSeries('nodesPerSecond'),
    yUnit: 'nps',
  });

  const depthChart = svgLineChart({
    title: 'Completed Search Depth by Position',
    xLabels: posLabels,
    datasets: aiSeries('completedDepth'),
    yUnit: '',
  });

  const depthEffChart = svgLineChart({
    title: 'Depth Efficiency (completedDepth / maxDepth)',
    xLabels: posLabels,
    datasets: aiSeries('depthEfficiency'),
    yUnit: '',
  });

  const branchChart = svgLineChart({
    title: 'Effective Branching Factor by Position',
    xLabels: posLabels,
    datasets: aiSeries('effectiveBranchingFactor'),
    yUnit: '',
  });

  // Legal action count is position-specific (not per difficulty), use hard states.
  const legalCounts = (ai.hard?.states ?? []).map((s) => ({
    label: s.label,
    value: s.legalActionCount ?? 0,
    color: C.single,
  }));
  const legalChart = svgHBarChart({
    title: 'Legal Action Count by Position (root branching)',
    items: legalCounts,
    xUnit: '',
    color: C.single,
  });

  // ── 2. Search quality ─────────────────────────────────────────────────────

  const cutoffChart = svgLineChart({
    title: 'Beta Cutoff Rate by Position',
    xLabels: posLabels,
    datasets: aiSeries('cutoffRate'),
    yUnit: '',
  });

  const ttChart = svgLineChart({
    title: 'Transposition Table Hit Rate by Position',
    xLabels: posLabels,
    datasets: aiSeries('transpositionHitRate'),
    yUnit: '',
  });

  // Avg aggregates across all positions, as a simple bar per difficulty.
  const avgNpsChart = svgBarChart({
    title: 'Avg Nodes/sec by Difficulty (all positions)',
    xLabels: ['easy', 'medium', 'hard'],
    datasets: [{
      label: 'avg nps',
      color: C.single,
      values: ['easy', 'medium', 'hard'].map((d) => ai[d]?.avgNodesPerSecond ?? null),
    }],
    yUnit: 'nps',
  });

  const avgDepthEffChart = svgBarChart({
    title: 'Avg Depth Efficiency by Difficulty',
    xLabels: ['easy', 'medium', 'hard'],
    datasets: [{
      label: 'avg depth efficiency',
      color: C.gain,
      values: ['easy', 'medium', 'hard'].map((d) => ai[d]?.avgDepthEfficiency ?? null),
    }],
    yUnit: '',
  });

  // ── 3. Domain primitives ──────────────────────────────────────────────────

  const domItems = [
    { label: 'advanceEngineState', value: domOps.advanceEngineState?.avgMs },
    { label: 'getLegalActions', value: domOps.getLegalActions?.avgMs },
    { label: 'selectableCoordsScan', value: domOps.selectableCoordsScan?.avgMs },
    { label: 'hasLegalActionCheck', value: domOps.hasLegalActionCheck?.avgMs },
    { label: 'hashPosition', value: domOps.hashPosition?.avgMs },
    { label: 'getLegalActionsForCell', value: domOps.getLegalActionsForCell?.avgMs },
  ]
    .filter((it) => it.value != null && it.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((it) => ({ ...it, color: C.domain }));

  const domChart = svgHBarChart({
    title: 'Domain Operation Timings (avg ms per call)',
    items: domItems,
    xUnit: 'ms',
    color: C.domain,
  });

  // ── 4. Root ordering cache ────────────────────────────────────────────────

  const cacheLabels = cacheBench.map((e) => e.label);

  const cacheCompareChart = svgBarChart({
    title: 'Root Ordering Cache: Baseline vs Optimized',
    xLabels: cacheLabels,
    datasets: [
      { label: 'baseline', color: C.baseline, values: cacheBench.map((e) => e.baselineMs) },
      { label: 'optimized', color: C.optimized, values: cacheBench.map((e) => e.optimizedMs) },
    ],
    yUnit: 'ms',
  });

  const cacheGainChart = svgLineChart({
    title: 'Root Ordering Cache: Gain % per Position',
    xLabels: cacheLabels,
    datasets: [{ label: 'gain %', color: C.gain, values: cacheBench.map((e) => e.gainPercent) }],
    yUnit: '%',
  });

  // ── 5. Browser load ───────────────────────────────────────────────────────

  const desktopLoad = report.desktop?.load ?? {};
  const mobileLoad = report.mobile?.load ?? {};
  const loadChart = svgBarChart({
    title: 'Browser Load Metrics: Desktop vs Mobile 1x',
    xLabels: ['FCP', 'LCP', 'DOM loaded', 'load event'],
    datasets: [
      {
        label: 'desktop',
        color: C.desktop,
        values: [
          desktopLoad.firstContentfulPaintMs,
          desktopLoad.largestContentfulPaintMs,
          desktopLoad.domContentLoadedMs,
          desktopLoad.loadEventMs,
        ],
      },
      {
        label: 'mobile 1x',
        color: C.mobile,
        values: [
          mobileLoad.firstContentfulPaintMs,
          mobileLoad.largestContentfulPaintMs,
          mobileLoad.domContentLoadedMs,
          mobileLoad.loadEventMs,
        ],
      },
    ],
    yUnit: 'ms',
  });

  // UI interaction latencies: desktop vs mobile
  const desktopUi = report.desktop?.ui ?? {};
  const mobileUi = report.mobile?.ui ?? {};
  const uiChart = svgBarChart({
    title: 'UI Interaction Latency: Desktop vs Mobile',
    xLabels: ['open dialog', 'choose action', 'commit move'],
    datasets: [
      {
        label: 'desktop',
        color: C.desktop,
        values: [
          desktopUi.openMoveDialog?.elapsedMs,
          desktopUi.chooseAction?.elapsedMs,
          desktopUi.commitMove?.elapsedMs,
        ],
      },
      {
        label: 'mobile 1x',
        color: C.mobile,
        values: [
          mobileUi.openMoveDialog?.elapsedMs,
          mobileUi.chooseAction?.elapsedMs,
          mobileUi.commitMove?.elapsedMs,
        ],
      },
    ],
    yUnit: 'ms',
  });

  // ── 6. AI response by difficulty ──────────────────────────────────────────

  const mobileDiffs = ['easy', 'medium', 'hard'];
  const aiByDiffChart = svgBarChart({
    title: 'Mobile AI Response Time by Difficulty (1x, opening)',
    xLabels: mobileDiffs,
    datasets: [
      {
        label: 'black (opening)',
        color: C.single,
        values: mobileDiffs.map((d) => report.mobile?.ai?.black?.[d]?.elapsedMs ?? null),
      },
      {
        label: 'white (reply)',
        color: C.optimized,
        values: mobileDiffs.map((d) => report.mobile?.ai?.white?.[d]?.elapsedMs ?? null),
      },
    ],
    yUnit: 'ms',
  });

  // ── 7. CPU throttle degradation ───────────────────────────────────────────

  const throttleColors = { '1x': C.desktop, '4x': C.throttle4x, '6x': C.throttle6x };

  // Dialog latency vs throttle level
  const dialogThrottleChart = svgLineChart({
    title: 'Move Dialog Latency vs CPU Throttle (mobile)',
    xLabels: throttleKeys,
    datasets: [
      {
        label: 'open dialog',
        color: C.single,
        values: throttleKeys.map((k) => mobileProfiles[k]?.ui?.openMoveDialog?.elapsedMs ?? null),
      },
    ],
    yUnit: 'ms',
  });

  // Hard AI response vs throttle
  const aiThrottleChart = svgLineChart({
    title: 'Hard AI Response Time vs CPU Throttle (mobile)',
    xLabels: throttleKeys,
    datasets: [
      {
        label: 'black (opening)',
        color: C.hard,
        values: throttleKeys.map((k) => mobileProfiles[k]?.ai?.black?.hard?.elapsedMs ?? null),
      },
      {
        label: 'white (reply)',
        color: C.medium,
        values: throttleKeys.map((k) => mobileProfiles[k]?.ai?.white?.hard?.elapsedMs ?? null),
      },
    ],
    yUnit: 'ms',
  });

  // All difficulties at each throttle level (bar chart — one group per throttle)
  const allThrottleChart = svgBarChart({
    title: 'Mobile AI Response Time: All Difficulties × Throttle',
    xLabels: mobileDiffs,
    datasets: throttleKeys.map((k) => ({
      label: `${k} throttle`,
      color: throttleColors[k] ?? C.domain,
      values: mobileDiffs.map((d) => mobileProfiles[k]?.ai?.black?.[d]?.elapsedMs ?? null),
    })),
    yUnit: 'ms',
  });

  // ── 8. Late-game AI timing ────────────────────────────────────────────────

  const lateGameAi = report.mobile?.lateGameAi ?? {};
  const lateGameItems = Object.entries(lateGameAi)
    .map(([label, result]) => ({ label, value: result.elapsedMs, color: C.hard }));

  const lateGameChart = lateGameItems.length
    ? svgHBarChart({
        title: 'Late-Game AI Response Time (hard, mobile 1x)',
        items: lateGameItems,
        xUnit: 'ms',
        color: C.hard,
      })
    : null;

  // Late-game vs throttle (line per position)
  const lateGameThrottleDatasets = lateGameItems.map((it, idx) => {
    const palette = [C.hard, C.medium, C.easy, C.single, C.optimized, C.gain];
    return {
      label: it.label,
      color: palette[idx % palette.length],
      values: throttleKeys.map((k) => mobileProfiles[k]?.lateGameAi?.[it.label]?.elapsedMs ?? null),
    };
  }).filter((ds) => ds.values.some((v) => v !== null));

  const lateGameThrottleChart = lateGameThrottleDatasets.length
    ? svgLineChart({
        title: 'Late-Game AI Response vs CPU Throttle (hard)',
        xLabels: throttleKeys,
        datasets: lateGameThrottleDatasets,
        yUnit: 'ms',
      })
    : null;

  // ── 9. JS bundle sizes ────────────────────────────────────────────────────

  const jsAssets = (report.chunkSizes?.jsAssets ?? []).slice(0, 12);
  const bundleItems = jsAssets.map((a) => ({
    label: a.assetName.replace(/[-.][\da-f]{8}/, '').replace(/\.js$/, ''),
    value: a.bytes / 1024,
    color: report.chunkSizes?.entryScripts?.some((e) => e.includes(a.assetName.split('-')[0]))
      ? C.hard
      : C.domain,
  }));

  const bundleChart = bundleItems.length
    ? svgHBarChart({
        title: 'JS Bundle Sizes (top 12 chunks, kB)',
        items: bundleItems,
        xUnit: '',
        color: C.domain,
      })
    : null;

  // ── Assemble ──────────────────────────────────────────────────────────────
  const generatedAt = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Performance Charts</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #f5f5f5;
      color: #1a1a1a;
      padding: 28px 24px;
      max-width: 1440px;
      margin: 0 auto;
    }
    header { margin-bottom: 36px; }
    h1 { font-size: 1.4rem; font-weight: 700; margin-bottom: 4px; }
    .meta { color: #888; font-size: 0.8rem; }
    section { margin-bottom: 44px; }
    h2 {
      font-size: 1rem;
      font-weight: 600;
      color: #333;
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 7px;
      margin-bottom: 8px;
    }
    .desc { font-size: 0.78rem; color: #777; margin-bottom: 14px; line-height: 1.5; }
    .chart-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(600px, 1fr));
      gap: 16px;
    }
    .chart-cell {
      background: white;
      border: 1px solid #e4e4e4;
      border-radius: 10px;
      padding: 14px 16px;
      box-shadow: 0 1px 4px rgba(0,0,0,.05);
    }
    .chart-cell svg { display: block; width: 100%; height: auto; }
  </style>
</head>
<body>
  <header>
    <h1>Performance Charts</h1>
    <p class="meta">Generated: ${generatedAt} &nbsp;·&nbsp; Source: perf-report.json</p>
  </header>

  ${section(
    'Game Progression',
    'How AI performance, search depth, and position complexity change from opening through mid-game. ' +
    'Positions: initialState / midgame20 / midgame40 (seeded random play, all pieces active) / threatState. ' +
    'These are measured with real wall-clock time.',
    [wallTimeChart, npsChart, depthChart, depthEffChart, branchChart, legalChart],
  )}

  ${section(
    'Search Quality',
    'Alpha-beta pruning effectiveness (beta cutoff rate) and transposition table utilisation ' +
    'across positions and difficulties.',
    [cutoffChart, ttChart, avgNpsChart, avgDepthEffChart],
  )}

  ${section(
    'Domain Primitives',
    'Average wall-clock time per call for core engine operations. Benchmarked on midgame20 position.',
    [domChart],
  )}

  ${section(
    'Root Ordering Cache',
    'Time to run all iterative-deepening depths at the root: baseline (full orderMoves each depth) ' +
    'vs optimised (precomputeOrderedActions once, then lightweight re-rank).',
    [cacheCompareChart, cacheGainChart],
  )}

  ${section(
    'Browser Load',
    'Real-browser measurements via Playwright on a local Vite preview build.',
    [loadChart, uiChart],
  )}

  ${section(
    'AI Response by Difficulty',
    'Mobile 1x (unthrottled): thinking time for the first AI move (black, opening position) ' +
    'and first AI reply (white, after one human move).',
    [aiByDiffChart],
  )}

  ${section(
    'CPU Throttle Degradation',
    'How AI thinking time and UI latency scale under CPU throttling. ' +
    '4x and 6x simulate progressively slower devices using Chrome DevTools throttling.',
    [dialogThrottleChart, aiThrottleChart, allThrottleChart],
  )}

  ${lateGameChart
    ? section(
        'Late-Game AI Response',
        'AI thinking time on imported game states at different stages (hard difficulty, mobile 1x). ' +
        'opening / midgame20 / midgame40 use realistic random-play positions. ' +
        'loopPressure / lateSparse use the fixed loop traces.',
        [lateGameChart, lateGameThrottleChart].filter(Boolean),
      )
    : ''}

  ${bundleChart
    ? section(
        'JS Bundle',
        'Sizes of individual JS chunks after the Vite production build. Entry chunks shown in red.',
        [bundleChart],
      )
    : ''}

</body>
</html>`;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function generateCharts(inputPath, outputPath) {
  const raw = await readFile(inputPath, 'utf8');
  const report = JSON.parse(raw);
  const html = buildHtml(report);
  await writeFile(outputPath, html, 'utf8');
  return outputPath;
}

async function main() {
  const inputPath = parseArg('input') ?? defaultInput;
  const outputPath = parseArg('output') ?? defaultOutput;

  process.stderr.write(`charts: reading ${inputPath}\n`);
  const out = await generateCharts(inputPath, outputPath);
  process.stdout.write(`${JSON.stringify({ chartsPath: out })}\n`);
  process.stderr.write(`charts: wrote ${out}\n`);
}

// Only run main() when this file is the direct entry point, not when imported as a module.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
