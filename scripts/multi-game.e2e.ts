import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';

import {
  beginSeriesGameResolution,
  createSeriesState,
} from '../src/app/store/createGameStore/series';
import {
  createInitialState,
  createUndoFrame,
  deserializeSession,
} from '../src/domain';
import type { Victory } from '../src/domain';
import type {
  MatchSettings,
  SerializableSession,
} from '../src/shared/types/session';
import {
  boardWithPieces,
  checker,
  createSession,
  gameStateWithBoard,
  resetFactoryIds,
} from '../src/test/factories';

const SCREENSHOT_DIR = '/tmp/youi-multi-game-e2e';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function seriesSettings(targetPoints: number): MatchSettings {
  return {
    aiDifficulty: 'medium',
    gameFormat: 'series',
    humanPlayer: 'white',
    opponentMode: 'hotSeat',
    targetPoints,
  };
}

function createNearDoubleFinishSession(
  targetPoints: number,
): SerializableSession {
  resetFactoryIds();
  const board = boardWithPieces({
    A1: [checker('black'), checker('black')],
    A2: [checker('black')],
    A3: [checker('white')],
    A4: [checker('white')],
    A5: [checker('white')],
    A6: [checker('white')],
    B1: [checker('black'), checker('black'), checker('black')],
    B4: [checker('white')],
    B5: [checker('white')],
    B6: [checker('white')],
    C1: [checker('black'), checker('black'), checker('black')],
    C4: [checker('white')],
    C6: [checker('white')],
    D1: [checker('black'), checker('black'), checker('black')],
    D4: [checker('white')],
    D5: [checker('white')],
    D6: [checker('white')],
    E1: [checker('black'), checker('black'), checker('black')],
    E4: [checker('white')],
    E5: [checker('white')],
    E6: [checker('white')],
    F1: [checker('black'), checker('black'), checker('black')],
    F4: [checker('white')],
    F5: [checker('white')],
    F6: [checker('white')],
  });
  const state = gameStateWithBoard(board);
  const matchSettings = seriesSettings(targetPoints);

  return createSession(state, {
    matchSettings,
    preferences: { language: 'english', passDeviceOverlayEnabled: true },
    seriesState: createSeriesState(matchSettings),
  });
}

function createDrawInterstitialSession(): SerializableSession {
  resetFactoryIds();
  const victory: Victory = { type: 'threefoldDraw' };
  const state = {
    ...createInitialState(),
    status: 'gameOver' as const,
    victory,
  };
  const matchSettings = seriesSettings(5);
  const seriesState = beginSeriesGameResolution(
    createSeriesState(matchSettings),
    victory,
    createUndoFrame(state),
  );

  return createSession(state, {
    matchSettings,
    preferences: { language: 'english', passDeviceOverlayEnabled: true },
    seriesState,
  });
}

async function clickUnique(
  locator: ReturnType<Page['getByRole']>,
  label: string,
): Promise<void> {
  await locator.waitFor({ state: 'visible' });
  const count = await locator.count();
  assert(count === 1, `${label}: expected one element, found ${count}.`);
  await locator.click();
}

async function useEnglish(page: Page): Promise<void> {
  const english = page.getByRole('button', { name: 'EN', exact: true });

  if ((await english.count()) === 1) {
    await english.click();
  }
}

async function importSession(
  page: Page,
  session: SerializableSession,
): Promise<void> {
  deserializeSession(JSON.stringify(session));
  await clickUnique(
    page.getByRole('tab', { name: 'Settings', exact: true }),
    'Settings tab',
  );
  await page
    .getByLabel('Import JSON', { exact: true })
    .fill(JSON.stringify(session));
  await clickUnique(
    page.getByRole('button', { name: 'Import session', exact: true }),
    'Import session',
  );
  assert(
    (await page
      .getByText('Failed to import the session JSON.', { exact: true })
      .count()) === 0,
    'Session import failed.',
  );
  await clickUnique(
    page.getByRole('tab', { name: 'Game', exact: true }),
    'Game tab',
  );
}

async function performAction(
  page: Page,
  source: string,
  action: string,
  target: string,
): Promise<void> {
  await clickUnique(
    page.getByRole('button', { name: `Cell ${source}`, exact: true }),
    source,
  );
  await clickUnique(
    page.getByRole('button', { name: action, exact: true }),
    action,
  );
  await clickUnique(
    page.getByRole('button', { name: `Cell ${target}`, exact: true }),
    target,
  );
}

async function assertNoHorizontalOverflow(
  page: Page,
  label: string,
): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  assert(
    dimensions.scrollWidth <= dimensions.clientWidth,
    `${label}: horizontal overflow ${dimensions.scrollWidth} > ${dimensions.clientWidth}.`,
  );
}

async function testResponsiveLayout(
  page: Page,
  baseUrl: string,
): Promise<void> {
  await page.goto(baseUrl);
  await useEnglish(page);
  await page.getByText('Points match', { exact: true }).click();
  await page.getByLabel('Points to win', { exact: true }).fill('7');
  await clickUnique(
    page.getByRole('button', { name: 'Start new game', exact: true }),
    'Start new game',
  );

  const viewports = [
    { height: 900, name: 'desktop', width: 1440 },
    { height: 1024, name: 'tablet', width: 820 },
    { height: 844, name: 'mobile', width: 390 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({
      height: viewport.height,
      width: viewport.width,
    });
    await page
      .getByRole('heading', { name: 'Match score', exact: true })
      .waitFor();
    await assertNoHorizontalOverflow(page, viewport.name);
    assert(
      await page
        .getByRole('region', { name: 'Game board', exact: true })
        .isVisible(),
      `${viewport.name}: board is not visible.`,
    );
    await page.screenshot({
      fullPage: true,
      path: path.join(SCREENSHOT_DIR, `${viewport.name}.png`),
    });
  }
}

async function testLiveModeSwitch(page: Page, baseUrl: string): Promise<void> {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto(baseUrl);
  await useEnglish(page);
  await performAction(page, 'A1', 'Climb', 'B2');
  await clickUnique(
    page.getByRole('button', { name: 'Continue', exact: true }),
    'Continue',
  );
  await clickUnique(
    page.getByRole('button', { name: 'Enable match', exact: true }),
    'Enable match',
  );
  await page
    .getByRole('heading', { name: 'Match score', exact: true })
    .waitFor();
  await clickUnique(
    page.getByRole('button', { name: 'Return to single game', exact: true }),
    'Return to single game',
  );
  assert(
    (await page
      .getByRole('heading', { name: 'Match score', exact: true })
      .count()) === 0,
    'Series scoreboard remained after returning to single game.',
  );
  assert(
    (await page.getByText('White: Climb A1 -> B2', { exact: true }).count()) ===
      1,
    'Live mode switch lost the current game history.',
  );
}

async function testFinishingAndColorChoice(
  page: Page,
  baseUrl: string,
): Promise<void> {
  await page.goto(baseUrl);
  await useEnglish(page);
  await importSession(page, createNearDoubleFinishSession(5));
  await performAction(page, 'A3', 'Jump', 'C5');
  await page.getByText('Completion phase', { exact: true }).waitFor();
  assert(
    !(await page
      .getByRole('button', { name: 'Undo', exact: true })
      .isEnabled()),
    'Undo remained enabled after the first winner.',
  );
  await performAction(page, 'A2', 'Climb', 'A1');

  const dialog = page.getByRole('dialog', { name: 'Next game', exact: true });
  await dialog.waitFor();
  const startNext = dialog.getByRole('button', {
    name: 'Start next game',
    exact: true,
  });
  assert(
    !(await startNext.isEnabled()),
    'Next game was enabled before the winner chose a color.',
  );
  await clickUnique(
    dialog.getByRole('button', { name: 'Black', exact: true }),
    'Choose black',
  );
  assert(
    await startNext.isEnabled(),
    'Next game stayed disabled after color choice.',
  );
  await startNext.click();
  await page.getByText('Game 2', { exact: true }).waitFor();
  assert(
    (await page
      .getByRole('button', { name: 'Return to single game', exact: true })
      .count()) === 0,
    'Series could be switched back after game one.',
  );

  const scorePanel = page
    .getByRole('heading', { name: 'Match score', exact: true })
    .locator('..')
    .locator('..');
  const scoreText = await scorePanel.innerText();
  assert(
    scoreText.includes('Player 1\nBlack'),
    'Winner color choice was not applied to Player 1.',
  );
  assert(
    scoreText.includes('Points: 1'),
    'Finishing action was not awarded as one point.',
  );
}

async function testDrawInterstitial(
  page: Page,
  baseUrl: string,
): Promise<void> {
  await page.goto(baseUrl);
  await useEnglish(page);
  await importSession(page, createDrawInterstitialSession());
  const dialog = page.getByRole('dialog', { name: 'Next game', exact: true });
  await dialog.waitFor();
  assert(
    (await dialog
      .getByText('Winner chooses a color', { exact: true })
      .count()) === 0,
    'Draw incorrectly requested a color choice.',
  );
  const startNext = dialog.getByRole('button', {
    name: 'Start next game',
    exact: true,
  });
  assert(
    await startNext.isEnabled(),
    'Draw did not allow the next game immediately.',
  );
  await startNext.click();
  await page.getByText('Game 2', { exact: true }).waitFor();

  const scorePanel = page
    .getByRole('heading', { name: 'Match score', exact: true })
    .locator('..')
    .locator('..');
  const scoreText = await scorePanel.innerText();
  assert(
    scoreText.includes('Player 1\nBlack'),
    'Draw did not automatically swap colors.',
  );
  assert(scoreText.includes('Points: 0'), 'Draw awarded match points.');
}

async function testMatchCompletion(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl);
  await useEnglish(page);
  await importSession(page, createNearDoubleFinishSession(1));
  await performAction(page, 'A3', 'Jump', 'C5');
  await performAction(page, 'A2', 'Climb', 'A1');

  const dialog = page.getByRole('dialog', {
    name: 'Match complete',
    exact: true,
  });
  await dialog.waitFor();
  assert(
    (await dialog.getByText('Difference: 1', { exact: true }).count()) === 1,
    'Final point difference was not shown.',
  );
  assert(
    (await dialog
      .getByRole('button', { name: 'Start next game', exact: true })
      .count()) === 0,
    'Match completion offered another game.',
  );
}

async function main(): Promise<void> {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  let server: ViteDevServer | null = null;
  let browser: Browser | null = null;

  try {
    server = await createServer({
      configFile: path.resolve('vite.config.ts'),
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 0 },
    });
    await server.listen();
    const baseUrl = server.resolvedUrls?.local[0];
    assert(baseUrl, 'Vite did not expose a local URL.');

    const launchedBrowser = await chromium.launch({ headless: true });
    browser = launchedBrowser;
    const browserErrors: string[] = [];
    const runScenario = async (
      scenario: (page: Page, url: string) => Promise<void>,
    ): Promise<void> => {
      const context = await launchedBrowser.newContext();
      const page = await context.newPage();

      page.on('console', (message) => {
        if (message.type() === 'error') {
          browserErrors.push(message.text());
        }
      });
      page.on('pageerror', (error) => browserErrors.push(error.message));

      try {
        await scenario(page, baseUrl);
      } finally {
        await context.close();
      }
    };

    await runScenario(testResponsiveLayout);
    await runScenario(testLiveModeSwitch);
    await runScenario(testFinishingAndColorChoice);
    await runScenario(testDrawInterstitial);
    await runScenario(testMatchCompletion);

    assert(
      browserErrors.length === 0,
      `Browser errors:\n${browserErrors.join('\n')}`,
    );
    console.log(`Multi-game E2E passed. Screenshots: ${SCREENSHOT_DIR}`);
  } finally {
    await browser?.close();
    await server?.close();
  }
}

void main();
