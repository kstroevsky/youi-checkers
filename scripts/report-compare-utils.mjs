import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function flattenNumericLeaves(value, prefix = '') {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return [[prefix, value]];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      flattenNumericLeaves(entry, prefix ? `${prefix}.${index}` : String(index)),
    );
  }

  if (value && typeof value === 'object') {
    return Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, entry]) =>
        flattenNumericLeaves(entry, prefix ? `${prefix}.${key}` : key),
      );
  }

  return [];
}

function formatDelta(value) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }

  if (value === 0) {
    return '0';
  }

  return `${value > 0 ? '+' : ''}${value}`;
}

function formatPercent(before, after) {
  if (!Number.isFinite(before) || before === 0 || !Number.isFinite(after)) {
    return 'n/a';
  }

  const deltaPercent = ((after - before) / Math.abs(before)) * 100;
  const rounded = Math.round(deltaPercent * 100) / 100;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

export async function readJsonReport(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export function buildComparisonMarkdown({
  afterLabel,
  afterPath,
  afterReport,
  beforeLabel,
  beforePath,
  beforeReport,
  notes = [],
  title,
}) {
  const beforeMetrics = new Map(flattenNumericLeaves(beforeReport));
  const afterMetrics = new Map(flattenNumericLeaves(afterReport));
  const comparisons = [...beforeMetrics.entries()]
    .filter(([metric]) => afterMetrics.has(metric))
    .map(([metric, before]) => {
      const after = afterMetrics.get(metric);
      const delta = after - before;
      const deltaPercent =
        before === 0 ? Number.NaN : ((after - before) / Math.abs(before)) * 100;

      return {
        after,
        before,
        delta,
        deltaPercent,
        metric,
      };
    })
    .sort((left, right) => {
      const leftMagnitude = Number.isFinite(left.deltaPercent)
        ? Math.abs(left.deltaPercent)
        : Math.abs(left.delta);
      const rightMagnitude = Number.isFinite(right.deltaPercent)
        ? Math.abs(right.deltaPercent)
        : Math.abs(right.delta);

      if (rightMagnitude !== leftMagnitude) {
        return rightMagnitude - leftMagnitude;
      }

      return left.metric.localeCompare(right.metric);
    });
  const topChanges = comparisons.slice(0, 10);
  const lines = [
    `# ${title}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'This file is a generated comparison artifact between two JSON report snapshots.',
    `- Before: \`${beforeLabel}\` (${path.relative(process.cwd(), beforePath)})`,
    `- After: \`${afterLabel}\` (${path.relative(process.cwd(), afterPath)})`,
    '- `delta` is `after - before`.',
    '- `delta%` is relative to the absolute `before` value when `before != 0`; otherwise it is `n/a`.',
    ...notes.map((note) => `- ${note}`),
    '',
    '## Summary',
    `- Numeric metrics compared: ${comparisons.length}`,
    `- Top absolute changes surfaced below: ${topChanges.length}`,
    '',
    '## Largest Changes',
  ];

  if (!topChanges.length) {
    lines.push('- No overlapping numeric metrics were found.');
  } else {
    for (const entry of topChanges) {
      lines.push(
        `- \`${entry.metric}\`: ${entry.before} -> ${entry.after} (${formatDelta(entry.delta)}, ${formatPercent(entry.before, entry.after)})`,
      );
    }
  }

  lines.push('');
  lines.push('## Full Comparison');
  lines.push('| metric | before | after | delta | delta% |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');

  for (const entry of comparisons) {
    lines.push(
      `| ${entry.metric} | ${entry.before} | ${entry.after} | ${formatDelta(entry.delta)} | ${formatPercent(entry.before, entry.after)} |`,
    );
  }

  return `${lines.join('\n')}\n`;
}

export async function writeComparisonReport(outputPath, markdown) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf8');
}
