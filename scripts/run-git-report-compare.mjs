import { access, mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

import {
  buildComparisonMarkdown,
  readJsonReport,
  writeComparisonReport,
} from './report-compare-utils.mjs';

const PIPELINES = {
  'ai-crossplay': {
    compareOutput: 'output/ai/ai-crossplay.compare.md',
    jsonOutput: 'output/ai/ai-crossplay-report.json',
    notes: [
      'Cross-play compares point-share, draw pressure, loop escape, and interestingness metrics across matching cells.',
    ],
    script: 'ai:crossplay',
    title: 'AI Cross-Play Comparison',
  },
  'ai-loop-benchmark': {
    compareOutput: 'output/ai/ai-loop-benchmark.compare.md',
    jsonOutput: 'output/ai/ai-loop-benchmark-report.json',
    notes: [
      'Lower repetition, lower laminarity, and faster loop escape are usually improvements.',
    ],
    script: 'ai:loop-benchmark',
    title: 'AI Loop Benchmark Comparison',
  },
  'ai-position-buckets': {
    compareOutput: 'output/ai/ai-position-buckets.compare.md',
    jsonOutput: 'output/ai/ai-position-buckets-report.json',
    notes: [
      'Bucket-level metrics compare families of positions rather than one single deterministic state.',
    ],
    script: 'ai:position-buckets',
    title: 'AI Position Bucket Comparison',
  },
  'ai-stage-variety': {
    compareOutput: 'output/ai/ai-stage-variety.compare.md',
    jsonOutput: 'output/ai/ai-stage-variety-report.json',
    notes: [
      'Interpret stage metrics by scenario because `opening`, `turn50`, `turn100`, and `turn200` have different structural goals.',
    ],
    script: 'ai:stage-variety',
    title: 'AI Stage Variety Comparison',
  },
  'ai-threat': {
    compareOutput: 'output/ai/ai-threat.compare.md',
    jsonOutput: 'output/ai/ai-threat-report.json',
    notes: [
      'Higher pressure and risk-progress metrics are only improvements when loop and draw metrics do not regress badly.',
    ],
    script: 'ai:threat',
    title: 'AI Threat Comparison',
  },
  'ai-variety': {
    compareOutput: 'output/ai/ai-variety.compare.md',
    jsonOutput: 'output/ai/ai-variety-report.json',
    notes: [
      'Improvement direction is metric-specific; use the target bands and AI variety semantics from `src/ai/test/metrics.ts`.',
    ],
    script: 'ai:variety',
    title: 'AI Variety Comparison',
  },
  'perf-report': {
    compareOutput: 'output/playwright/perf-report.git-compare.md',
    jsonOutput: 'output/playwright/perf-report.json',
    notes: [
      'Improvement direction is metric-specific; interpret the rows using the metric semantics from `scripts/perf-report.mjs`.',
    ],
    script: 'perf:report',
    title: 'Performance Comparison',
  },
};

function parseKnownArgs(argv) {
  const known = new Set(['pipeline', 'before', 'after', 'out']);
  const parsed = {
    after: 'working',
    before: 'HEAD',
    forwarded: [],
    out: null,
    pipeline: 'ai-variety',
  };

  for (const entry of argv) {
    if (!entry.startsWith('--')) {
      parsed.forwarded.push(entry);
      continue;
    }

    const [rawKey, rawValue = ''] = entry.slice(2).split('=');

    if (!known.has(rawKey)) {
      parsed.forwarded.push(entry);
      continue;
    }

    parsed[rawKey] = rawValue;
  }

  return parsed;
}

function runNpmScript(cwd, script, forwardedArgs) {
  const args = ['run', script];

  if (forwardedArgs.length) {
    args.push('--', ...forwardedArgs);
  }

  execFileSync('npm', args, {
    cwd,
    stdio: 'inherit',
  });
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function prepareRefWorkspace(ref) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'youi-report-compare-'));

  execFileSync('git', ['worktree', 'add', '--detach', tempDir, ref], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  try {
    await symlink(path.join(process.cwd(), 'node_modules'), path.join(tempDir, 'node_modules'), 'dir');
  } catch {
    // Reusing the current workspace dependencies is best-effort only.
  }

  return tempDir;
}

async function cleanupRefWorkspace(workdir) {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', workdir], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
  } catch {
    await rm(workdir, { force: true, recursive: true });
  }
}

async function materializeReport(target, pipeline, forwardedArgs) {
  if (target === 'working') {
    let runError = null;

    try {
      runNpmScript(process.cwd(), pipeline.script, forwardedArgs);
    } catch (error) {
      runError = error;
    }

    const outputPath = path.join(process.cwd(), pipeline.jsonOutput);

    // Some report scripts intentionally exit non-zero when they detect regressions.
    // For compare purposes the JSON artifact is the source of truth, so keep going
    // when the report was still emitted successfully.
    if (runError && !(await fileExists(outputPath))) {
      throw runError;
    }

    return {
      cleanup: null,
      label: 'working-tree',
      path: outputPath,
    };
  }

  const workdir = await prepareRefWorkspace(target);

  try {
    let runError = null;

    try {
      runNpmScript(workdir, pipeline.script, forwardedArgs);
    } catch (error) {
      runError = error;
    }

    const outputPath = path.join(workdir, pipeline.jsonOutput);

    // Historical snapshots follow the same rule as the working tree: a generated
    // JSON report is enough to compare, even if the pipeline used exit status as
    // a quality gate.
    if (runError && !(await fileExists(outputPath))) {
      throw runError;
    }

    return {
      cleanup: async () => cleanupRefWorkspace(workdir),
      label: target,
      path: outputPath,
    };
  } catch (error) {
    await cleanupRefWorkspace(workdir);
    throw error;
  }
}

async function main() {
  const parsed = parseKnownArgs(process.argv.slice(2));
  const pipeline = PIPELINES[parsed.pipeline];

  if (!pipeline) {
    throw new Error(`Unknown pipeline "${parsed.pipeline}".`);
  }

  const beforeSnapshot = await materializeReport(parsed.before, pipeline, parsed.forwarded);
  const afterSnapshot = await materializeReport(parsed.after, pipeline, parsed.forwarded);

  try {
    const [beforeReport, afterReport] = await Promise.all([
      readJsonReport(beforeSnapshot.path),
      readJsonReport(afterSnapshot.path),
    ]);
    const outputPath = path.join(process.cwd(), parsed.out ?? pipeline.compareOutput);
    const markdown = buildComparisonMarkdown({
      afterLabel: afterSnapshot.label,
      afterPath: afterSnapshot.path,
      afterReport,
      beforeLabel: beforeSnapshot.label,
      beforePath: beforeSnapshot.path,
      beforeReport,
      notes: pipeline.notes,
      title: pipeline.title,
    });

    await writeComparisonReport(outputPath, markdown);
  } finally {
    if (beforeSnapshot.cleanup) {
      await beforeSnapshot.cleanup();
    }

    if (afterSnapshot.cleanup) {
      await afterSnapshot.cleanup();
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
