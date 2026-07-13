const DEFAULT_BOOTSTRAP_SAMPLES = 4_000;
const DEFAULT_CONFIDENCE_LEVEL = 0.95;

function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function quantile(sortedValues, probability) {
  if (!sortedValues.length) {
    return Number.NaN;
  }

  const position = (sortedValues.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];

  if (lowerIndex === upperIndex) {
    return lower;
  }

  return lower + (upper - lower) * (position - lowerIndex);
}

function median(values) {
  return quantile(
    [...values].sort((left, right) => left - right),
    0.5,
  );
}

function createDeterministicRandom(seed = 0x5eed1234) {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function bootstrapMedianInterval(
  pairedImprovements,
  bootstrapSamples = DEFAULT_BOOTSTRAP_SAMPLES,
  confidenceLevel = DEFAULT_CONFIDENCE_LEVEL,
) {
  if (pairedImprovements.every((value) => value === pairedImprovements[0])) {
    return {
      high: pairedImprovements[0],
      low: pairedImprovements[0],
    };
  }

  const random = createDeterministicRandom();
  const medians = [];

  for (let sampleIndex = 0; sampleIndex < bootstrapSamples; sampleIndex += 1) {
    const sample = [];

    for (let index = 0; index < pairedImprovements.length; index += 1) {
      sample.push(
        pairedImprovements[Math.floor(random() * pairedImprovements.length)],
      );
    }

    medians.push(median(sample));
  }

  medians.sort((left, right) => left - right);
  const tail = (1 - confidenceLevel) / 2;

  return {
    high: quantile(medians, 1 - tail),
    low: quantile(medians, tail),
  };
}

function assertFiniteSamples(label, values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} must contain at least one sample.`);
  }

  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label} contains a non-finite sample.`);
  }
}

export function buildPairedSchedule(pairCount) {
  if (!Number.isInteger(pairCount) || pairCount < 1) {
    throw new Error('Pair count must be a positive integer.');
  }

  return Array.from({ length: pairCount }, (_, pairIndex) => ({
    order:
      pairIndex % 2 === 0
        ? ['baseline', 'candidate']
        : ['candidate', 'baseline'],
    pairIndex,
  }));
}

export function summarizePairedMetric({
  baseline,
  bootstrapSamples = DEFAULT_BOOTSTRAP_SAMPLES,
  candidate,
  confidenceLevel = DEFAULT_CONFIDENCE_LEVEL,
  direction,
  guardrailsPassed = true,
  minimumImprovementPercent,
}) {
  assertFiniteSamples('Baseline', baseline);
  assertFiniteSamples('Candidate', candidate);

  if (baseline.length !== candidate.length) {
    throw new Error('Baseline and candidate sample counts must match.');
  }

  if (direction !== 'higher' && direction !== 'lower') {
    throw new Error('Metric direction must be "higher" or "lower".');
  }

  if (!(minimumImprovementPercent >= 0)) {
    throw new Error('Minimum improvement must be non-negative.');
  }

  const pairedImprovements = baseline.map((baselineValue, index) => {
    if (baselineValue === 0) {
      throw new Error(
        'Cannot calculate relative improvement from a zero baseline.',
      );
    }

    const candidateValue = candidate[index];
    const signedDelta =
      direction === 'lower'
        ? baselineValue - candidateValue
        : candidateValue - baselineValue;

    return (signedDelta / Math.abs(baselineValue)) * 100;
  });
  const rawInterval = bootstrapMedianInterval(
    pairedImprovements,
    bootstrapSamples,
    confidenceLevel,
  );
  const medianImprovementPercent = median(pairedImprovements);
  let verdict = 'inconclusive';

  if (!guardrailsPassed || rawInterval.high < 0) {
    verdict = 'regression';
  } else if (rawInterval.low >= minimumImprovementPercent) {
    verdict = 'confirmed-win';
  } else if (
    rawInterval.low >= 0 &&
    rawInterval.high < minimumImprovementPercent
  ) {
    verdict = 'null-result';
  }

  return {
    baselineMedian: round(median(baseline)),
    baselineP95: round(
      quantile(
        [...baseline].sort((left, right) => left - right),
        0.95,
      ),
    ),
    candidateMedian: round(median(candidate)),
    candidateP95: round(
      quantile(
        [...candidate].sort((left, right) => left - right),
        0.95,
      ),
    ),
    confidenceIntervalPercent: {
      high: round(rawInterval.high),
      low: round(rawInterval.low),
    },
    medianImprovementPercent: round(medianImprovementPercent),
    pairedImprovementsPercent: pairedImprovements.map((value) => round(value)),
    sampleCount: baseline.length,
    verdict,
  };
}

export function assertCompatibleReports(baseline, candidate) {
  const baselineContract = baseline?.contract;
  const candidateContract = candidate?.contract;

  if (
    !baselineContract ||
    !candidateContract ||
    baselineContract.schemaVersion !== candidateContract.schemaVersion ||
    baselineContract.workloadId !== candidateContract.workloadId
  ) {
    throw new Error(
      'Benchmark contract mismatch between baseline and candidate.',
    );
  }

  const baselineFixtures = baseline?.guardrails?.fixtures;
  const candidateFixtures = candidate?.guardrails?.fixtures;

  if (
    !Array.isArray(baselineFixtures) ||
    !Array.isArray(candidateFixtures) ||
    JSON.stringify(baselineFixtures) !== JSON.stringify(candidateFixtures)
  ) {
    throw new Error(
      'Guardrail fixture mismatch between baseline and candidate.',
    );
  }
}

function addMetric(
  metrics,
  name,
  value,
  direction,
  unit,
  role,
  guardrail = {},
) {
  if (!Number.isFinite(value)) {
    return;
  }

  metrics[name] = {
    direction,
    ...guardrail,
    role,
    unit,
    value,
  };
}

export function normalizeDomainReport(report) {
  if (!report?.domain || !report?.ai) {
    throw new Error(
      'Domain performance report is missing domain or AI metrics.',
    );
  }

  const metrics = {};
  const fixtures = [];
  const quality = [];
  const selectedActions = [];

  for (const [name, entry] of Object.entries(report.domain)) {
    addMetric(
      metrics,
      `domain.${name}.avgMs`,
      entry?.avgMs,
      'lower',
      'ms',
      'diagnostic',
    );
  }

  for (const [difficulty, entry] of Object.entries(report.ai)) {
    const summaryRole = difficulty === 'hard' ? 'decision' : 'diagnostic';

    addMetric(
      metrics,
      `ai.${difficulty}.avgNodesPerSecond`,
      entry?.avgNodesPerSecond,
      'higher',
      'nodes/s',
      summaryRole,
    );
    addMetric(
      metrics,
      `ai.${difficulty}.avgDepthEfficiency`,
      entry?.avgDepthEfficiency,
      'higher',
      'ratio',
      'guardrail',
    );
    addMetric(
      metrics,
      `ai.${difficulty}.avgWallTimeMs`,
      entry?.avgWallTimeMs,
      'lower',
      'ms',
      'diagnostic',
    );

    for (const state of entry?.states ?? []) {
      const prefix = `ai.${difficulty}.states.${state.label}`;

      fixtures.push({
        difficulty,
        label: state.label,
        legalActionCount: state.legalActionCount,
      });
      selectedActions.push({
        action: state.action ?? null,
        difficulty,
        label: state.label,
      });
      quality.push({
        completedDepth: state.completedDepth,
        difficulty,
        label: state.label,
      });
      addMetric(
        metrics,
        `${prefix}.nodesPerSecond`,
        state.nodesPerSecond,
        'higher',
        'nodes/s',
        'diagnostic',
      );
      addMetric(
        metrics,
        `${prefix}.completedDepth`,
        state.completedDepth,
        'higher',
        'depth',
        'guardrail',
      );
      addMetric(
        metrics,
        `${prefix}.wallTimeMs`,
        state.wallTimeMs,
        'lower',
        'ms',
        'diagnostic',
      );
    }
  }

  for (const entry of report.rootOrderingCacheBenchmark ?? []) {
    addMetric(
      metrics,
      `rootOrdering.${entry.label}.optimizedMs`,
      entry.optimizedMs,
      'lower',
      'ms',
      'diagnostic',
    );
  }

  fixtures.sort((left, right) =>
    `${left.difficulty}:${left.label}`.localeCompare(
      `${right.difficulty}:${right.label}`,
    ),
  );
  selectedActions.sort((left, right) =>
    `${left.difficulty}:${left.label}`.localeCompare(
      `${right.difficulty}:${right.label}`,
    ),
  );
  quality.sort((left, right) =>
    `${left.difficulty}:${left.label}`.localeCompare(
      `${right.difficulty}:${right.label}`,
    ),
  );

  return {
    contract: {
      schemaVersion: 1,
      workloadId: 'domain-ai-v1',
    },
    guardrails: { fixtures },
    metrics,
    observations: { quality, selectedActions },
  };
}

function addBrowserMetrics(metrics, prefix, value, path = []) {
  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    const nextPath = [...path, key];

    if (entry && typeof entry === 'object') {
      addBrowserMetrics(metrics, prefix, entry, nextPath);
      continue;
    }

    if (!Number.isFinite(entry)) {
      continue;
    }

    const metricName = `${prefix}.${nextPath.join('.')}`;

    if (key.toLowerCase().includes('longtask')) {
      addMetric(
        metrics,
        metricName,
        entry,
        'lower',
        key.endsWith('Ms') ? 'ms' : 'count',
        'guardrail',
        {
          absoluteTolerance: key.endsWith('Ms') ? 50 : 1,
          minimumSamples: 10,
        },
      );
    } else if (key.endsWith('Ms')) {
      addMetric(metrics, metricName, entry, 'lower', 'ms', 'diagnostic');
    } else if (key.toLowerCase().includes('layoutshift')) {
      addMetric(metrics, metricName, entry, 'lower', 'score', 'guardrail', {
        absoluteTolerance: 0.01,
        minimumSamples: 10,
      });
    } else if (key === 'longTaskCount') {
      addMetric(metrics, metricName, entry, 'lower', 'count', 'guardrail');
    }
  }
}

export function normalizeFullReport(report) {
  if (!report?.domain) {
    throw new Error(
      'Full performance report is missing embedded domain metrics.',
    );
  }

  const normalized = normalizeDomainReport(report.domain);
  normalized.contract = {
    schemaVersion: 1,
    workloadId: 'full-app-v1',
  };
  addBrowserMetrics(normalized.metrics, 'browser.desktop', report.desktop);
  addBrowserMetrics(normalized.metrics, 'browser.mobile', report.mobile);

  for (const [profile, entry] of Object.entries(report.mobileProfiles ?? {})) {
    if (profile === '1x') {
      continue;
    }

    addBrowserMetrics(
      normalized.metrics,
      `browser.mobileProfiles.${profile}`,
      entry,
    );
  }

  addMetric(
    normalized.metrics,
    'artifact.initialJsBytes',
    report.chunkSizes?.initialJsBytes,
    'lower',
    'bytes',
    'guardrail',
    { maximumRegressionPercent: 1, minimumSamples: 1 },
  );
  addMetric(
    normalized.metrics,
    'artifact.totalJsBytes',
    report.chunkSizes?.totalJsBytes,
    'lower',
    'bytes',
    'guardrail',
    { maximumRegressionPercent: 1, minimumSamples: 1 },
  );

  return normalized;
}

export function parsePerfAbArgs(argv) {
  const parsed = {
    baseline: null,
    bootstrapSamples: DEFAULT_BOOTSTRAP_SAMPLES,
    candidate: null,
    dryRun: false,
    minimumDecisionPairs: 10,
    minimumImprovementPercent: 5,
    outputDir: 'output/perf-ab',
    pairCount: 20,
    pipeline: 'domain',
    rootOrderingIterations: 24,
    skipBuild: false,
    skipValidation: false,
  };

  for (const argument of argv) {
    if (argument === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }

    if (argument === '--skip-build') {
      parsed.skipBuild = true;
      continue;
    }

    if (argument === '--skip-validation') {
      parsed.skipValidation = true;
      continue;
    }

    const separator = argument.indexOf('=');

    if (!argument.startsWith('--') || separator === -1) {
      throw new Error(`Unknown performance A/B argument: ${argument}`);
    }

    const name = argument.slice(2, separator);
    const value = argument.slice(separator + 1);

    switch (name) {
      case 'baseline':
        parsed.baseline = value;
        break;
      case 'bootstrap-samples':
        parsed.bootstrapSamples = Number.parseInt(value, 10);
        break;
      case 'candidate':
        parsed.candidate = value;
        break;
      case 'minimum-improvement':
        parsed.minimumImprovementPercent = Number(value);
        break;
      case 'minimum-decision-pairs':
        parsed.minimumDecisionPairs = Number.parseInt(value, 10);
        break;
      case 'out':
        parsed.outputDir = value;
        break;
      case 'pairs':
        parsed.pairCount = Number.parseInt(value, 10);
        break;
      case 'pipeline':
        parsed.pipeline = value;
        break;
      case 'root-order-iterations':
        parsed.rootOrderingIterations = Number.parseInt(value, 10);
        break;
      default:
        throw new Error(`Unknown performance A/B argument: --${name}`);
    }
  }

  if (!parsed.baseline || !parsed.candidate) {
    throw new Error('Both --baseline and --candidate Git refs are required.');
  }

  if (
    parsed.baseline.toLowerCase() === 'working' ||
    parsed.candidate.toLowerCase() === 'working'
  ) {
    throw new Error(
      'Each performance target must be an immutable Git ref, not "working".',
    );
  }

  if (parsed.pipeline !== 'domain' && parsed.pipeline !== 'full') {
    throw new Error('--pipeline must be either "domain" or "full".');
  }

  if (parsed.baseline === parsed.candidate) {
    throw new Error('Baseline and candidate Git refs must be different.');
  }

  if (!Number.isInteger(parsed.pairCount) || parsed.pairCount < 2) {
    throw new Error('--pairs must be an integer of at least 2.');
  }

  if (
    !Number.isInteger(parsed.bootstrapSamples) ||
    parsed.bootstrapSamples < 100
  ) {
    throw new Error('--bootstrap-samples must be an integer of at least 100.');
  }

  if (
    !Number.isFinite(parsed.minimumImprovementPercent) ||
    parsed.minimumImprovementPercent < 0
  ) {
    throw new Error('--minimum-improvement must be a non-negative number.');
  }

  if (
    !Number.isInteger(parsed.minimumDecisionPairs) ||
    parsed.minimumDecisionPairs < 2
  ) {
    throw new Error(
      '--minimum-decision-pairs must be an integer of at least 2.',
    );
  }

  if (
    !Number.isInteger(parsed.rootOrderingIterations) ||
    parsed.rootOrderingIterations < 1
  ) {
    throw new Error('--root-order-iterations must be a positive integer.');
  }

  return parsed;
}

function summarizeAbsoluteGuardrail({
  absoluteTolerance = 0,
  baseline,
  candidate,
  direction,
  maximumRegressionPercent = 0,
  minimumSamples = 1,
}) {
  const baselineMedian = median(baseline);
  const candidateMedian = median(candidate);
  const regressionDelta =
    direction === 'lower'
      ? candidateMedian - baselineMedian
      : baselineMedian - candidateMedian;
  const regressionPercent =
    baselineMedian === 0
      ? null
      : (regressionDelta / Math.abs(baselineMedian)) * 100;
  const withinTolerance =
    regressionDelta <= absoluteTolerance ||
    (regressionPercent !== null &&
      regressionPercent <= maximumRegressionPercent);
  const passed = withinTolerance
    ? true
    : baseline.length < minimumSamples
      ? null
      : false;

  return {
    baselineMedian: round(baselineMedian),
    candidateMedian: round(candidateMedian),
    passed,
    regressionPercent:
      regressionPercent === null ? null : round(regressionPercent),
    verdict:
      passed === true
        ? 'passed'
        : passed === false
          ? 'regression'
          : 'inconclusive',
  };
}

function qualityKey(entry) {
  return `${entry.difficulty}:${entry.label}`;
}

function evaluateQualityGuardrails(pairs) {
  const violations = [];
  const firstQuality = pairs[0].baseline.observations?.quality ?? [];

  for (const firstEntry of firstQuality) {
    const key = qualityKey(firstEntry);
    const baseline = [];
    const candidate = [];

    for (const pair of pairs) {
      const baselineEntry = (pair.baseline.observations?.quality ?? []).find(
        (entry) => qualityKey(entry) === key,
      );
      const candidateEntry = (pair.candidate.observations?.quality ?? []).find(
        (entry) => qualityKey(entry) === key,
      );

      if (!baselineEntry || !candidateEntry) {
        throw new Error(
          `Quality guardrail ${key} is missing from a paired report.`,
        );
      }

      baseline.push(baselineEntry.completedDepth);
      candidate.push(candidateEntry.completedDepth);
    }

    const baselineMedian = median(baseline);
    const candidateMedian = median(candidate);

    if (candidateMedian < baselineMedian) {
      violations.push({
        baselineMedian,
        candidateMedian,
        key,
        metric: 'completedDepth',
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

export function buildExperimentSummary(
  pairs,
  { bootstrapSamples, minimumDecisionPairs = 10, minimumImprovementPercent },
) {
  if (!Array.isArray(pairs) || pairs.length < 2) {
    throw new Error('At least two paired reports are required.');
  }

  for (const pair of pairs) {
    assertCompatibleReports(pair.baseline, pair.candidate);
    assertCompatibleReports(pairs[0].baseline, pair.baseline);
    assertCompatibleReports(pairs[0].candidate, pair.candidate);
  }

  const baselineMetricNames = Object.keys(pairs[0].baseline.metrics).sort();
  const candidateMetricNames = Object.keys(pairs[0].candidate.metrics).sort();

  if (
    JSON.stringify(baselineMetricNames) !== JSON.stringify(candidateMetricNames)
  ) {
    throw new Error('Metric set mismatch between baseline and candidate.');
  }

  const metrics = {};

  for (const metricName of baselineMetricNames) {
    const definition = pairs[0].baseline.metrics[metricName];
    const baseline = [];
    const candidate = [];

    for (const pair of pairs) {
      const baselineMetric = pair.baseline.metrics[metricName];
      const candidateMetric = pair.candidate.metrics[metricName];

      if (
        !baselineMetric ||
        !candidateMetric ||
        baselineMetric.direction !== candidateMetric.direction ||
        baselineMetric.role !== candidateMetric.role ||
        baselineMetric.unit !== candidateMetric.unit
      ) {
        throw new Error(`Metric definition mismatch for ${metricName}.`);
      }

      baseline.push(baselineMetric.value);
      candidate.push(candidateMetric.value);
    }

    const result =
      definition.role === 'guardrail'
        ? summarizeAbsoluteGuardrail({
            absoluteTolerance: definition.absoluteTolerance,
            baseline,
            candidate,
            direction: definition.direction,
            maximumRegressionPercent: definition.maximumRegressionPercent,
            minimumSamples: definition.minimumSamples,
          })
        : summarizePairedMetric({
            baseline,
            bootstrapSamples,
            candidate,
            direction: definition.direction,
            minimumImprovementPercent,
          });

    metrics[metricName] = {
      ...definition,
      ...result,
    };
    delete metrics[metricName].value;
  }

  const qualityGuardrails = evaluateQualityGuardrails(pairs);
  const metricGuardrailFailed = Object.values(metrics).some(
    (metric) => metric.role === 'guardrail' && metric.passed === false,
  );
  const metricGuardrailInconclusive = Object.values(metrics).some(
    (metric) => metric.role === 'guardrail' && metric.passed === null,
  );
  const decisionVerdicts = Object.values(metrics)
    .filter((metric) => metric.role === 'decision')
    .map((metric) => metric.verdict);
  let overallVerdict = 'inconclusive';

  if (
    !qualityGuardrails.passed ||
    metricGuardrailFailed ||
    (pairs.length >= minimumDecisionPairs &&
      decisionVerdicts.includes('regression'))
  ) {
    overallVerdict = 'regression';
  } else if (metricGuardrailInconclusive) {
    overallVerdict = 'inconclusive';
  } else if (pairs.length < minimumDecisionPairs) {
    overallVerdict = 'inconclusive';
  } else if (
    decisionVerdicts.length > 0 &&
    decisionVerdicts.every((verdict) => verdict === 'confirmed-win')
  ) {
    overallVerdict = 'confirmed-win';
  } else if (
    decisionVerdicts.length > 0 &&
    decisionVerdicts.every((verdict) => verdict === 'null-result')
  ) {
    overallVerdict = 'null-result';
  }

  return {
    metrics,
    overallVerdict,
    pairCount: pairs.length,
    qualityGuardrails,
  };
}
