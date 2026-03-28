import path from 'node:path';
import process from 'node:process';

import {
  buildComparisonMarkdown,
  readJsonReport,
  writeComparisonReport,
} from './report-compare-utils.mjs';

const DEFAULT_BEFORE = path.join(process.cwd(), 'output', 'playwright', 'perf-report.before.json');
const DEFAULT_AFTER = path.join(process.cwd(), 'output', 'playwright', 'perf-report.json');
const DEFAULT_OUTPUT = path.join(process.cwd(), 'output', 'playwright', 'perf-report.before-after.md');

function parseArg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((entry) => entry.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

async function main() {
  const beforePath = parseArg('before', DEFAULT_BEFORE);
  const afterPath = parseArg('after', DEFAULT_AFTER);
  const outputPath = parseArg('out', DEFAULT_OUTPUT);
  const [beforeReport, afterReport] = await Promise.all([
    readJsonReport(beforePath),
    readJsonReport(afterPath),
  ]);
  const markdown = buildComparisonMarkdown({
    afterLabel: 'after',
    afterPath,
    afterReport,
    beforeLabel: 'before',
    beforePath,
    beforeReport,
    notes: [
      'Improvement direction is metric-specific; interpret the rows using the metric semantics from `scripts/perf-report.mjs`.',
    ],
    title: 'Performance Comparison',
  });

  await writeComparisonReport(outputPath, markdown);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
