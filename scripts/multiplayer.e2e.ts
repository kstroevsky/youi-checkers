import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium, type Page } from 'playwright';

const baseUrl = process.env.YOUI_E2E_BASE_URL ?? 'http://127.0.0.1:8788';
const outputDir = path.resolve('output/playwright/multiplayer');

type RenderedState = {
  board: Record<string, Array<{ frozen: boolean; owner: string }>>;
  moveNumber: number;
  online: {
    participant: 'first' | 'second';
    pendingCommand: boolean;
    revision: number;
    status: string;
  };
  selectableCoords: string[];
};

async function renderedState(page: Page): Promise<RenderedState> {
  return page.evaluate(() => {
    const render = (window as Window & { render_game_to_text?: () => string })
      .render_game_to_text;

    if (!render) throw new Error('render_game_to_text is unavailable.');
    return JSON.parse(render()) as RenderedState;
  });
}

async function waitForRevision(page: Page, revision: number): Promise<void> {
  await page.waitForFunction((expected) => {
    const render = (window as Window & { render_game_to_text?: () => string })
      .render_game_to_text;
    if (!render) return false;
    const state = JSON.parse(render()) as RenderedState;
    return (
      state.online.status === 'connected' &&
      state.online.revision === expected &&
      !state.online.pendingCommand
    );
  }, revision);
}

async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const errors: string[] = [];

  try {
    const creatorContext = await browser.newContext({
      viewport: { height: 900, width: 1440 },
    });
    const invitedContext = await browser.newContext({
      viewport: { height: 844, width: 390 },
    });
    const creator = await creatorContext.newPage();
    const invited = await invitedContext.newPage();

    for (const page of [creator, invited]) {
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(String(error)));
    }

    await creator.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await creator.locator('#create-online-match').click();
    const inviteUrl = await creator
      .locator('#online-invite-output')
      .inputValue({ timeout: 10_000 });

    await invited.goto(inviteUrl, { waitUntil: 'domcontentloaded' });
    await waitForRevision(creator, 0);
    await waitForRevision(invited, 0);
    await creator.locator('#leave-online-match').waitFor();
    await invited.locator('#leave-online-match').waitFor();

    const beforeCreator = await renderedState(creator);
    const beforeInvited = await renderedState(invited);

    if (
      beforeCreator.online.participant !== 'first' ||
      beforeInvited.online.participant !== 'second' ||
      beforeCreator.selectableCoords.length === 0 ||
      beforeInvited.selectableCoords.length !== 0
    ) {
      throw new Error('Initial online seat/turn projection is inconsistent.');
    }

    await creator.screenshot({
      fullPage: true,
      path: path.join(outputDir, 'desktop-connected.png'),
    });
    await invited.screenshot({
      fullPage: true,
      path: path.join(outputDir, 'mobile-connected.png'),
    });

    await creator.getByRole('button', { name: 'Cell A1' }).click();
    await creator.getByRole('button', { exact: true, name: 'Climb' }).click();
    await creator.getByRole('button', { name: 'Cell B2' }).click();
    await waitForRevision(creator, 1);
    await waitForRevision(invited, 1);

    const afterCreator = await renderedState(creator);
    const afterInvited = await renderedState(invited);

    if (
      afterCreator.moveNumber !== 2 ||
      JSON.stringify(afterCreator.board) !==
        JSON.stringify(afterInvited.board) ||
      afterCreator.selectableCoords.length !== 0 ||
      afterInvited.selectableCoords.length === 0
    ) {
      throw new Error('Committed move did not converge across both browsers.');
    }

    await creator.screenshot({
      fullPage: true,
      path: path.join(outputDir, 'desktop-after-move.png'),
    });
    await invited.screenshot({
      fullPage: true,
      path: path.join(outputDir, 'mobile-after-move.png'),
    });

    if (errors.length) {
      throw new Error(`Browser console errors:\n${errors.join('\n')}`);
    }

    await writeFile(
      path.join(outputDir, 'state.json'),
      `${JSON.stringify({ afterCreator, afterInvited }, null, 2)}\n`,
      'utf8',
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
