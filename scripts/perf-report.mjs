/* global AbortSignal, PerformanceObserver, console, document, fetch, getComputedStyle, performance, requestAnimationFrame, setTimeout, window */

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

import { chromium } from 'playwright';

import { generateCharts } from './perf-charts.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright');
const reportPath = path.join(outputDir, 'perf-report.json');
const summaryPath = path.join(outputDir, 'perf-report.md');
const domainPerfPath = path.join(outputDir, 'domain-perf.json');
const previewPort = 4176;
const previewUrl = `http://127.0.0.1:${previewPort}/`;
const defaultMobileCpuRates = [1, 4, 6];

function cpuRateKey(rate) {
  return `${rate}x`;
}

/**
 * Builds the localStorage seed for the Playwright browser context.
 *
 * The app defaults to English when localStorage is empty; all selectors in this
 * script use Russian labels. Seeding a valid Russian-language initial session
 * ensures the correct locale from the very first paint.
 */
function buildSeedSessionJson() {
  const columns = ['A', 'B', 'C', 'D', 'E', 'F'];
  const board = {};
  let wi = 1;
  let bi = 1;

  for (let row = 1; row <= 6; row++) {
    for (const col of columns) {
      const coord = `${col}${row}`;

      if (row <= 3) {
        board[coord] = {
          checkers: [{ id: `white-${String(wi++).padStart(2, '0')}`, owner: 'white', frozen: false }],
        };
      } else {
        board[coord] = {
          checkers: [{ id: `black-${String(bi++).padStart(2, '0')}`, owner: 'black', frozen: false }],
        };
      }
    }
  }

  const snapshot = {
    board,
    currentPlayer: 'white',
    moveNumber: 1,
    status: 'active',
    victory: { type: 'none' },
    pendingJump: null,
  };

  const session = {
    version: 4,
    ruleConfig: { allowNonAdjacentFriendlyStackTransfer: false, drawRule: 'none', scoringMode: 'basic' },
    preferences: { language: 'russian', passDeviceOverlayEnabled: true },
    matchSettings: { opponentMode: 'hotSeat', humanPlayer: 'white', aiDifficulty: 'easy' },
    aiBehaviorProfile: null,
    turnLog: [],
    present: { snapshot, positionCounts: {}, historyCursor: 0 },
    past: [],
    future: [],
  };

  const envelope = { version: 1, sessionId: 'perf-seed', revision: 0, kind: 'compact', session };

  return JSON.stringify(envelope);
}

const SEED_SESSION_JSON = buildSeedSessionJson();

function parseCpuRates(input) {
  if (!input?.trim()) {
    return defaultMobileCpuRates;
  }

  const parsed = input
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value >= 1);
  const normalized = Array.from(new Set(parsed.length ? parsed : defaultMobileCpuRates))
    .sort((left, right) => left - right);

  if (!normalized.includes(1)) {
    normalized.unshift(1);
  }

  return normalized;
}

function classifyLower(value, good, warn) {
  if (value <= good) {
    return 'good';
  }

  if (value <= warn) {
    return 'warn';
  }

  return 'bad';
}

function classifyHigher(value, good, warn) {
  if (value >= good) {
    return 'good';
  }

  if (value >= warn) {
    return 'warn';
  }

  return 'bad';
}

function formatSpeedup(value) {
  return Number.isFinite(value) ? `${value}x` : 'n/a';
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });

      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until preview is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Preview server did not start within ${timeoutMs}ms.`);
}

function startPreviewServer() {
  const child = spawn(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(previewPort)],
    {
      cwd: rootDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let stderr = '';

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  return {
    child,
    getStderr: () => stderr,
  };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stderr, stdout });
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} exited with code ${code}\n${stderr || stdout}`,
        ),
      );
    });
  });
}

async function collectChunkSizes() {
  const assetsDir = path.join(rootDir, 'dist', 'assets');
  const assetNames = await readdir(assetsDir);
  const jsAssets = await Promise.all(
    assetNames
      .filter((assetName) => assetName.endsWith('.js'))
      .map(async (assetName) => ({
        assetName,
        bytes: (await stat(path.join(assetsDir, assetName))).size,
      })),
  );
  const html = await readFile(path.join(rootDir, 'dist', 'index.html'), 'utf8');
  const entryScripts = Array.from(
    html.matchAll(/<script[^>]+src="\/assets\/([^"]+\.js)"/g),
    (match) => match[1],
  );

  return {
    entryScripts,
    jsAssets: jsAssets.sort((left, right) => right.bytes - left.bytes),
    lazyChunkSmoke: {
      moveInputModal: jsAssets.some(({ assetName }) => assetName.includes('MoveInputModal')),
      gameResultModal: jsAssets.some(({ assetName }) => assetName.includes('GameResultModal')),
      glossaryTooltipDialog: jsAssets.some(({ assetName }) =>
        assetName.includes('GlossaryTooltipDialog'),
      ),
      turnOverlay: jsAssets.some(({ assetName }) => assetName.includes('TurnOverlay')),
    },
    totalJsBytes: jsAssets.reduce((sum, asset) => sum + asset.bytes, 0),
  };
}

async function collectDomainPerf() {
  await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'run',
    'test:run',
    '--',
    '--config',
    'scripts/vitest.perf.config.ts',
    'scripts/domainPerformance.report.ts',
  ], {
    env: {
      ...process.env,
      WMBL_PERF_REPORT: '1',
      WMBL_DOMAIN_PERF_OUTPUT: domainPerfPath,
    },
  });

  return JSON.parse(await readFile(domainPerfPath, 'utf8'));
}

async function applyCpuThrottling(page, cpuRate) {
  if (!(cpuRate > 1)) {
    return null;
  }

  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  page.once('close', () => {
    void session.detach().catch(() => {});
  });

  return session;
}

async function createMeasuredPage(browser, viewport, cpuRate = 1) {
  const page = await browser.newPage({ viewport });
  await applyCpuThrottling(page, cpuRate);

  // Seed Russian-language session before the app boots so all subsequent
  // selectors (which assume Russian UI labels) can find their elements.
  await page.addInitScript(`localStorage.setItem('youi/session/v4', ${JSON.stringify(SEED_SESSION_JSON)})`);

  await page.addInitScript(() => {
    window.__wmblPerf = {
      largestContentfulPaintMs: null,
      layoutShifts: [],
      longTasks: [],
    };

    const safeRound = (value) => Math.round(value * 100) / 100;

    if ('PerformanceObserver' in window) {
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__wmblPerf.longTasks.push({
              duration: safeRound(entry.duration),
              name: entry.name,
              startTime: safeRound(entry.startTime),
            });
          }
        }).observe({ buffered: true, type: 'longtask' });
      } catch {
        // Unsupported in some runtimes.
      }

      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.hadRecentInput) {
              continue;
            }

            window.__wmblPerf.layoutShifts.push({
              startTime: safeRound(entry.startTime),
              value: safeRound(entry.value),
            });
          }
        }).observe({ buffered: true, type: 'layout-shift' });
      } catch {
        // Unsupported in some runtimes.
      }

      try {
        new PerformanceObserver((list) => {
          const lastEntry = list.getEntries().at(-1);

          if (lastEntry) {
            window.__wmblPerf.largestContentfulPaintMs = safeRound(lastEntry.startTime);
          }
        }).observe({ buffered: true, type: 'largest-contentful-paint' });
      } catch {
        // Unsupported in some runtimes.
      }
    }
  });

  await page.goto(previewUrl, { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Клетка A1' }).waitFor({ state: 'visible', timeout: 12000 });
  await page.waitForTimeout(600);

  return page;
}

async function collectDomMetrics(page) {
  return page.evaluate(() => ({
    buttons: document.getElementsByTagName('button').length,
    checkerNodes: document.querySelectorAll('[data-checker-node]').length,
    dialogs: document.querySelectorAll('[role="dialog"]').length,
    elements: document.getElementsByTagName('*').length,
    historyItems: document.querySelectorAll('li').length,
  }));
}

async function collectLoadMetrics(page) {
  return page.evaluate(() => {
    const navigationEntry = performance.getEntriesByType('navigation')[0];
    const paints = Object.fromEntries(
      performance
        .getEntriesByType('paint')
        .map((entry) => [entry.name, Math.round(entry.startTime * 100) / 100]),
    );
    const perfState = window.__wmblPerf ?? {
      largestContentfulPaintMs: null,
      layoutShifts: [],
      longTasks: [],
    };

    return {
      domContentLoadedMs: Math.round((navigationEntry?.domContentLoadedEventEnd ?? 0) * 100) / 100,
      firstContentfulPaintMs: paints['first-contentful-paint'] ?? null,
      firstPaintMs: paints['first-paint'] ?? null,
      largestContentfulPaintMs: perfState.largestContentfulPaintMs,
      loadEventMs: Math.round((navigationEntry?.loadEventEnd ?? 0) * 100) / 100,
      longTaskCount: perfState.longTasks.length,
      longTaskMaxMs: perfState.longTasks.length
        ? Math.max(...perfState.longTasks.map((entry) => entry.duration))
        : 0,
      totalLayoutShift: Math.round(
        perfState.layoutShifts.reduce((sum, entry) => sum + entry.value, 0) * 1000,
      ) / 1000,
    };
  });
}

async function beginInteraction(page) {
  await page.evaluate(() => {
    window.__wmblActiveInteraction = {
      layoutShiftIndex: window.__wmblPerf.layoutShifts.length,
      longTaskIndex: window.__wmblPerf.longTasks.length,
      startedAt: performance.now(),
    };
  });
}

async function endInteraction(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  return page.evaluate(() => {
    const interaction = window.__wmblActiveInteraction;
    const longTasks = window.__wmblPerf.longTasks.slice(interaction.longTaskIndex);
    const layoutShifts = window.__wmblPerf.layoutShifts.slice(interaction.layoutShiftIndex);

    return {
      elapsedMs: Math.round((performance.now() - interaction.startedAt) * 100) / 100,
      layoutShiftScore:
        Math.round(layoutShifts.reduce((sum, entry) => sum + entry.value, 0) * 1000) / 1000,
      longTaskCount: longTasks.length,
      maxLongTaskMs: longTasks.length ? Math.max(...longTasks.map((entry) => entry.duration)) : 0,
      totalLongTaskMs: Math.round(
        longTasks.reduce((sum, entry) => sum + entry.duration, 0) * 100,
      ) / 100,
    };
  });
}

async function measureInteraction(page, trigger, settle) {
  await beginInteraction(page);
  await trigger();
  await settle();
  return endInteraction(page);
}

async function dismissBlockingUi(page) {
  const continueButton = page.getByRole('button', { name: 'Продолжить' });

  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click();
    await page.waitForTimeout(100);
  }

  const moveDialog = page.getByRole('dialog', { name: 'Выберите ход' });

  if (await moveDialog.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await moveDialog.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
}

async function measureBoardUi(page) {
  const openMoveDialog = await measureInteraction(
    page,
    () => page.getByRole('button', { name: 'Клетка A1' }).click(),
    () => page.getByRole('dialog', { name: 'Выберите ход' }).waitFor({ state: 'visible', timeout: 3000 }),
  );
  const chooseAction = await measureInteraction(
    page,
    () => page.getByRole('button', { name: 'Восхождение', exact: true }).click(),
    () =>
      page.waitForFunction(() => {
        const target = Array.from(document.querySelectorAll('button')).find((element) =>
          element.getAttribute('aria-label') === 'Клетка B2' ||
          element.textContent?.includes('Клетка B2'),
        );

        return target?.getAttribute('data-target') === 'true';
      }, { timeout: 3000 }),
  );
  const commitMove = await measureInteraction(
    page,
    () => page.getByRole('button', { name: 'Клетка B2' }).click(),
    () => page.waitForFunction(() => (document.body.textContent || '').includes('Ход: 2'), { timeout: 3000 }),
  );

  return {
    chooseAction,
    commitMove,
    openMoveDialog,
  };
}

async function configureCompactMatch(page, settings) {
  await dismissBlockingUi(page);
  await page.getByRole('tab', { name: 'Инфо' }).click();
  await page.getByRole('heading', { name: 'Параметры матча' }).waitFor({ state: 'visible', timeout: 3000 });
  await page.locator('label').filter({ hasText: 'Играть с компьютером' }).click();
  await page.locator('label').filter({ hasText: settings.humanPlayer === 'white' ? 'Белые' : 'Чёрные' }).click();
  await page.getByRole('combobox', { name: 'Сложность' }).selectOption(settings.difficulty);
}

async function measureAiResponse(page, settings) {
  await configureCompactMatch(page, settings);

  if (settings.humanPlayer === 'black') {
    return measureInteraction(
      page,
      async () => {
        await page.getByRole('button', { name: 'Начать новую партию' }).click();
      },
      () =>
        page.waitForFunction(
          () => (document.body.textContent || '').includes('Чёрные ходят') && (document.body.textContent || '').includes('Ход: 2'),
          { timeout: 12000 },
        ),
    );
  }

  await page.getByRole('button', { name: 'Начать новую партию' }).click();
  await page.getByRole('button', { name: 'Клетка A1' }).click();
  await page.getByRole('button', { name: 'Восхождение', exact: true }).click();

  return measureInteraction(
    page,
    () => page.getByRole('button', { name: 'Клетка B2' }).click(),
    () =>
      page.waitForFunction(
        () => (document.body.textContent || '').includes('Белые ходят') && (document.body.textContent || '').includes('Ход: 3'),
        { timeout: 12000 },
      ),
  );
}

async function waitForImportedSession(page, expectedMoveNumber) {
  await page.waitForFunction(
    () => {
      const importField = document.querySelector('#import-session');

      return importField?.tagName === 'TEXTAREA' && importField.value === '';
    },
    { timeout: 20000 },
  );
  await page.getByRole('tab', { name: 'Игра' }).click();
  await page.waitForFunction(
    (moveNumber) => {
      const bodyText = document.body.textContent || '';
      const turnMatch = bodyText.match(/Ход:\s*(\d+)/);
      const turnNumber = turnMatch ? Number(turnMatch[1]) : null;

      return turnNumber === moveNumber;
    },
    expectedMoveNumber,
    { timeout: 20000 },
  );
}

async function importLateGameSession(page, fixture) {
  await dismissBlockingUi(page);
  await page.getByRole('tab', { name: 'Настройки' }).click();
  await page.getByRole('heading', { name: 'Правила и партия' }).waitFor({
    state: 'visible',
    timeout: 3000,
  });
  await page.locator('#import-session').fill(fixture.sessionJson);
  await page.getByRole('button', { name: 'Импортировать партию' }).click();
  await waitForImportedSession(page, fixture.moveNumber);
  await page.getByRole('button', { name: fixture.sourceCellLabel }).waitFor({
    state: 'visible',
    timeout: 3000,
  });
}

async function waitForLateGameAiTurn(page, minimumTurnNumberAfterAi) {
  await page.waitForFunction(
    (minimumTurnNumber) => {
      const bodyText = document.body.textContent || '';
      const turnMatch = bodyText.match(/Ход:\s*(\d+)/);
      const turnNumber = turnMatch ? Number(turnMatch[1]) : 0;

      return turnNumber >= minimumTurnNumber && !bodyText.includes('Компьютер думает');
    },
    minimumTurnNumberAfterAi,
    { timeout: 15000 },
  );
}

async function measureLateGameAiResponse(page, fixture) {
  await importLateGameSession(page, fixture);
  await page.getByRole('button', { name: fixture.sourceCellLabel }).click();

  if (!fixture.targetCellLabels.length) {
    return measureInteraction(
      page,
      () => page.getByRole('button', { name: fixture.actionButtonLabel, exact: true }).click(),
      () => waitForLateGameAiTurn(page, fixture.minimumTurnNumberAfterAi),
    );
  }

  await page.getByRole('button', { name: fixture.actionButtonLabel, exact: true }).click();

  return measureInteraction(
    page,
    async () => {
      for (const targetCellLabel of fixture.targetCellLabels) {
        await page.getByRole('button', { name: targetCellLabel }).click();
      }
    },
    () => waitForLateGameAiTurn(page, fixture.minimumTurnNumberAfterAi),
  );
}

async function measureCompactTabs(page) {
  await dismissBlockingUi(page);
  const toInfo = await measureInteraction(
    page,
    () => page.getByRole('tab', { name: 'Инфо' }).click(),
    () => page.getByRole('heading', { name: 'Параметры матча' }).waitFor({ state: 'visible', timeout: 3000 }),
  );
  const toHistory = await measureInteraction(
    page,
    () => page.getByRole('tab', { name: 'История' }).click(),
    () => page.getByRole('heading', { name: 'История' }).waitFor({ state: 'visible', timeout: 3000 }),
  );

  return {
    toHistory,
    toInfo,
  };
}

async function collectScrollMetrics(page) {
  return page.evaluate(() => ({
    bodyClientHeight: document.body.clientHeight,
    bodyScrollHeight: document.body.scrollHeight,
    contentOverflowY:
      getComputedStyle(document.querySelector('[class*="content"]') ?? document.body).overflowY,
    documentOverflowY: getComputedStyle(document.documentElement).overflowY,
  }));
}

async function measureViewportScenario(
  browser,
  viewport,
  { cpuRate = 1, lateGameAiFixtures = [] } = {},
) {
  const page = await createMeasuredPage(browser, viewport, cpuRate);

  try {
    const load = await collectLoadMetrics(page);
    const render = {
      initial: await collectDomMetrics(page),
      scroll: await collectScrollMetrics(page),
    };
    const ui = await measureBoardUi(page);
    const result = {
      cpuRate,
      load,
      render,
      ui,
      viewport,
    };

    if (viewport.width <= 390) {
      result.compactTabs = await measureCompactTabs(page);
      result.ai = {
        black: Object.fromEntries(
          await Promise.all(
            ['easy', 'medium', 'hard'].map(async (difficulty) => {
              const aiPage = await createMeasuredPage(browser, viewport, cpuRate);

              try {
                return [
                  difficulty,
                  await measureAiResponse(aiPage, { difficulty, humanPlayer: 'black' }),
                ];
              } finally {
                await aiPage.close();
              }
            }),
          ),
        ),
        white: Object.fromEntries(
          await Promise.all(
            ['easy', 'medium', 'hard'].map(async (difficulty) => {
              const aiPage = await createMeasuredPage(browser, viewport, cpuRate);

              try {
                return [
                  difficulty,
                  await measureAiResponse(aiPage, { difficulty, humanPlayer: 'white' }),
                ];
              } finally {
                await aiPage.close();
              }
            }),
          ),
        ),
      };
      result.lateGameAi = Object.fromEntries(
        await Promise.all(
          lateGameAiFixtures.map(async (fixture) => {
            const aiPage = await createMeasuredPage(browser, viewport, cpuRate);

            try {
              return [fixture.label, await measureLateGameAiResponse(aiPage, fixture)];
            } finally {
              await aiPage.close();
            }
          }),
        ),
      );
    }

    return result;
  } finally {
    await page.close();
  }
}

function buildSummary(report) {
  const mobileProfiles = report.mobileProfiles ?? { '1x': report.mobile };
  const weakDeviceProfiles = Object.entries(mobileProfiles)
    .filter(([key]) => key !== '1x')
    .sort((left, right) => Number(left[0].replace('x', '')) - Number(right[0].replace('x', '')));
  const rootCacheBenchmarks =
    report.domain.rootOrderingCacheBenchmark ?? report.rootOrderingCacheBenchmark ?? [];
  const lateGameAiProfiles = Object.entries(mobileProfiles)
    .filter(([, profile]) => profile.lateGameAi && Object.keys(profile.lateGameAi).length > 0)
    .sort((left, right) => Number(left[0].replace('x', '')) - Number(right[0].replace('x', '')));
  const checks = [
    {
      label: 'Desktop FCP',
      status: classifyLower(report.desktop.load.firstContentfulPaintMs ?? 9999, 1200, 2000),
      value: `${report.desktop.load.firstContentfulPaintMs ?? 'n/a'}ms`,
    },
    {
      label: 'Mobile FCP',
      status: classifyLower(report.mobile.load.firstContentfulPaintMs ?? 9999, 1600, 2400),
      value: `${report.mobile.load.firstContentfulPaintMs ?? 'n/a'}ms`,
    },
    {
      label: 'Desktop move dialog',
      status: classifyLower(report.desktop.ui.openMoveDialog.elapsedMs, 120, 220),
      value: `${report.desktop.ui.openMoveDialog.elapsedMs}ms`,
    },
    {
      label: 'Mobile move dialog',
      status: classifyLower(report.mobile.ui.openMoveDialog.elapsedMs, 140, 260),
      value: `${report.mobile.ui.openMoveDialog.elapsedMs}ms`,
    },
    {
      label: 'Mobile hard AI opening',
      status: classifyLower(report.mobile.ai.black.hard.elapsedMs, 1800, 3200),
      value: `${report.mobile.ai.black.hard.elapsedMs}ms`,
    },
    {
      label: 'Domain full action scan',
      status: classifyLower(report.domain.domain.getLegalActions.avgMs, 0.25, 0.5),
      value: `${report.domain.domain.getLegalActions.avgMs}ms`,
    },
    {
      label: 'Domain cell action scan',
      status: classifyLower(report.domain.domain.getLegalActionsForCell.avgMs, 0.06, 0.12),
      value: `${report.domain.domain.getLegalActionsForCell.avgMs}ms`,
    },
    {
      label: 'Hash position',
      status: classifyLower(report.domain.domain.hashPosition.avgMs, 0.02, 0.05),
      value: `${report.domain.domain.hashPosition.avgMs}ms`,
    },
    // Search throughput guardrails — thresholds are conservative (catch ~10x regressions).
    // Tighten once baseline values are established from a few report runs.
    {
      label: 'Hard AI avg nodes/sec',
      status: classifyHigher(report.domain.ai?.hard?.avgNodesPerSecond ?? 0, 3000, 500),
      value: `${report.domain.ai?.hard?.avgNodesPerSecond ?? 'n/a'} nps`,
    },
    {
      label: 'Medium AI avg nodes/sec',
      status: classifyHigher(report.domain.ai?.medium?.avgNodesPerSecond ?? 0, 1000, 200),
      value: `${report.domain.ai?.medium?.avgNodesPerSecond ?? 'n/a'} nps`,
    },
    {
      label: 'Hard AI depth efficiency',
      status: classifyHigher(report.domain.ai?.hard?.avgDepthEfficiency ?? 0, 0.8, 0.5),
      value: `${report.domain.ai?.hard?.avgDepthEfficiency ?? 'n/a'}`,
    },
  ];

  const lines = [
    '# Performance Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    'This file is a generated report artifact from `npm run perf:report`.',
    '- Browser timings come from `scripts/perf-report.mjs` against a local `vite preview` build.',
    '- Domain timings come from `scripts/domainPerformance.report.ts` and are merged into this summary.',
    '- CPU throttle profiles use Chrome DevTools `Emulation.setCPUThrottlingRate` with `1x` meaning unthrottled, and `4x` / `6x` meaning progressively slower simulated devices.',
    '- `GOOD`, `WARN`, and `BAD` in the summary are repository-specific guardrails encoded in `scripts/perf-report.mjs`, not universal SLAs.',
    '',
    '## Summary',
    ...checks.map((check) => `- [${check.status.toUpperCase()}] ${check.label}: ${check.value}`),
    '',
    '## Load',
    `- Desktop: FCP ${report.desktop.load.firstContentfulPaintMs ?? 'n/a'}ms, LCP ${report.desktop.load.largestContentfulPaintMs ?? 'n/a'}ms, load ${report.desktop.load.loadEventMs}ms`,
    `- Mobile: FCP ${report.mobile.load.firstContentfulPaintMs ?? 'n/a'}ms, LCP ${report.mobile.load.largestContentfulPaintMs ?? 'n/a'}ms, load ${report.mobile.load.loadEventMs}ms`,
    '',
    '## Render / UI',
    `- Desktop DOM nodes: ${report.desktop.render.initial.elements}, checker nodes: ${report.desktop.render.initial.checkerNodes}`,
    `- Mobile DOM nodes: ${report.mobile.render.initial.elements}, checker nodes: ${report.mobile.render.initial.checkerNodes}`,
    `- Desktop move dialog open: ${report.desktop.ui.openMoveDialog.elapsedMs}ms`,
    `- Mobile move dialog open: ${report.mobile.ui.openMoveDialog.elapsedMs}ms`,
    `- Mobile tab switch: Info ${report.mobile.compactTabs.toInfo.elapsedMs}ms, History ${report.mobile.compactTabs.toHistory.elapsedMs}ms`,
    '',
    '## AI',
    `- Mobile opening turn: easy ${report.mobile.ai.black.easy.elapsedMs}ms, medium ${report.mobile.ai.black.medium.elapsedMs}ms, hard ${report.mobile.ai.black.hard.elapsedMs}ms`,
    `- Mobile reply turn: easy ${report.mobile.ai.white.easy.elapsedMs}ms, medium ${report.mobile.ai.white.medium.elapsedMs}ms, hard ${report.mobile.ai.white.hard.elapsedMs}ms`,
    '',
    '## Weak Device (CPU Throttle)',
    ...(weakDeviceProfiles.length
      ? weakDeviceProfiles.flatMap(([profileKey, profile]) => ([
          `- ${profileKey}: move dialog ${profile.ui.openMoveDialog.elapsedMs}ms, hard opening ${profile.ai.black.hard.elapsedMs}ms, hard reply ${profile.ai.white.hard.elapsedMs}ms`,
        ]))
      : ['- No additional CPU-throttled mobile profile was collected.']),
    '',
    '## Late-Game AI (Hard)',
    ...(lateGameAiProfiles.length
      ? lateGameAiProfiles.map(([profileKey, profile]) => {
          const lateGameLines = Object.entries(profile.lateGameAi)
            .map(([label, result]) => `${label} ${result.elapsedMs}ms`)
            .join(', ');

          return `- ${profileKey}: ${lateGameLines}`;
        })
      : ['- Late-game imported AI scenarios were not collected.']),
    '',
    '## Domain',
    `- hashPosition avg: ${report.domain.domain.hashPosition.avgMs}ms`,
    `- getLegalActions avg: ${report.domain.domain.getLegalActions.avgMs}ms`,
    `- getLegalActionsForCell avg: ${report.domain.domain.getLegalActionsForCell.avgMs}ms`,
    `- selectable scan avg: ${report.domain.domain.selectableCoordsScan.avgMs}ms`,
    `- hasLegalAction check avg: ${report.domain.domain.hasLegalActionCheck.avgMs}ms`,
    `- Cell-vs-full action speedup: ${formatSpeedup(report.domain.comparisons.cellActionVsFullActionSpeedup)}`,
    `- Hash-vs-full action speedup: ${formatSpeedup(report.domain.comparisons.hashVsFullActionSpeedup)}`,
    '',
    '## Search Efficiency',
    '- Positions: initialState, midGame20 (seeded random play), midGame40 (seeded random play), threatState.',
    '- midGame20/40 positions have all pieces active and a realistic branching factor (~15–30 legal moves).',
    ...(report.domain.ai
      ? ['easy', 'medium', 'hard'].map((difficulty) => {
          const d = report.domain.ai[difficulty];
          if (!d) return `- ${difficulty}: not available`;
          const perPosition = (d.states ?? [])
            .map((s) => `${s.label} d${s.completedDepth}/${s.legalActionCount}br ${s.nodesPerSecond}nps`)
            .join(', ');
          return `- ${difficulty}: avg ${d.avgNodesPerSecond} nps, depth efficiency ${d.avgDepthEfficiency} | ${perPosition}`;
        })
      : ['- Search efficiency data not available.']),
    '',
    '## Root Ordering Cache Benchmark',
    ...(rootCacheBenchmarks.length
      ? rootCacheBenchmarks.map((entry) =>
          `- ${entry.label}: baseline ${entry.baselineMs}ms, optimized ${entry.optimizedMs}ms, gain ${entry.gainMs}ms (${entry.gainPercent}%)`,
        )
      : ['- Root-ordering cache benchmark was not provided by the domain report.']),
  ];

  return {
    checks,
    markdown: `${lines.join('\n')}\n`,
  };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const mobileCpuRates = parseCpuRates(process.env.WMBL_PERF_CPU_RATES);

  process.stderr.write('perf: collecting domain benchmarks\n');
  const domain = await collectDomainPerf();
  const lateGameAiFixtures = domain.lateGameAiFixtures ?? [];

  const preview = startPreviewServer();

  try {
    process.stderr.write('perf: waiting for preview server\n');
    await waitForServer(previewUrl);
    process.stderr.write('perf: preview server ready\n');

    const browser = await chromium.launch({ headless: true });

    try {
      const chunkSizes = await collectChunkSizes();
      process.stderr.write('perf: measuring desktop browser path\n');
      const desktop = await measureViewportScenario(
        browser,
        { width: 1440, height: 900 },
        { cpuRate: 1 },
      );
      const mobileProfiles = {};
      for (const cpuRate of mobileCpuRates) {
        process.stderr.write(`perf: measuring mobile browser path (${cpuRateKey(cpuRate)})\n`);
        mobileProfiles[cpuRateKey(cpuRate)] = await measureViewportScenario(
          browser,
          { width: 390, height: 844 },
          { cpuRate, lateGameAiFixtures },
        );
      }
      const mobile = mobileProfiles['1x'] ?? mobileProfiles[cpuRateKey(mobileCpuRates[0])];
      const report = {
        chunkSizes,
        desktop,
        domain,
        generatedAt: new Date().toISOString(),
        mobile,
        mobileProfiles,
        previewUrl,
      };
      const summary = buildSummary(report);

      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      await writeFile(summaryPath, summary.markdown, 'utf8');

      process.stderr.write('perf: generating charts\n');
      const chartsPath = path.join(outputDir, 'perf-charts.html');
      await generateCharts(reportPath, chartsPath);

      process.stdout.write(`${JSON.stringify({ chartsPath, reportPath, summaryPath, summary: summary.checks }, null, 2)}\n`);
    } finally {
      await browser.close();
    }
  } finally {
    preview.child.kill('SIGTERM');

    if (preview.child.exitCode === null) {
      const didExit = await Promise.race([
        once(preview.child, 'exit').then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 2000)),
      ]);

      if (!didExit && preview.child.exitCode === null) {
        preview.child.kill('SIGKILL');
        await once(preview.child, 'exit');
      }
    }

    if (preview.child.exitCode && preview.child.exitCode !== 143) {
      process.stderr.write(
        `perf: preview server exited with code ${preview.child.exitCode}\n${preview.getStderr()}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
