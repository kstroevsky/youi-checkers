import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium, type Page } from 'playwright';

const baseUrl = process.env.YOUI_E2E_BASE_URL ?? 'http://127.0.0.1:8788';
const outputDir = path.resolve('output/playwright/multiplayer');

type RenderedState = {
  board: Record<string, Array<{ frozen: boolean; owner: string }>>;
  currentPlayer: 'white' | 'black';
  historyCursor: number;
  historyLength: number;
  lastMove: { source: string; target: string } | null;
  moveNumber: number;
  online: {
    participant: 'first' | 'second';
    pendingCommand: boolean;
    revision: number;
    status: string;
  };
  rules: {
    allowNonAdjacentFriendlyStackTransfer: boolean;
  };
  selectedCell: string | null;
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

async function commitMove(options: {
  action: string;
  actor: Page;
  creator: Page;
  invited: Page;
  revision: number;
  source: string;
  target: string;
}): Promise<void> {
  await options.actor.getByRole('button', { name: `Cell ${options.source}` }).click();
  await options.actor
    .getByRole('button', { exact: true, name: options.action })
    .click();
  await options.actor.getByRole('button', { name: `Cell ${options.target}` }).click();
  await waitForRevision(options.creator, options.revision);
  await waitForRevision(options.invited, options.revision);
}

async function assertReadOnlyHistory(page: Page, count: number): Promise<void> {
  const historyTray = page.getByRole('tab', {
    exact: true,
    name: 'History',
  });
  if ((await historyTray.count()) && (await historyTray.isVisible())) {
    await historyTray.click();
  }

  const entries = page.locator('ol button');
  await entries.first().waitFor({ state: 'visible' });
  if ((await entries.count()) !== count) {
    throw new Error(`Expected ${count} visible history entries.`);
  }

  for (let index = 0; index < count; index += 1) {
    const entry = entries.nth(index);
    if (!(await entry.isVisible()) || !(await entry.isDisabled())) {
      throw new Error('Online history must be visible and non-clickable.');
    }
  }
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
      beforeInvited.selectableCoords.length !== 0 ||
      !beforeCreator.rules.allowNonAdjacentFriendlyStackTransfer
    ) {
      throw new Error('Initial online seat/turn projection is inconsistent.');
    }

    if (!(await invited.getByRole('button', { name: 'Cell A1' }).isDisabled())) {
      throw new Error('The non-active participant can click an opponent checker.');
    }

    await creator.screenshot({
      fullPage: true,
      path: path.join(outputDir, 'desktop-connected.png'),
    });
    await invited.screenshot({
      fullPage: true,
      path: path.join(outputDir, 'mobile-connected.png'),
    });

    await commitMove({
      action: 'Climb',
      actor: creator,
      creator,
      invited,
      revision: 1,
      source: 'A1',
      target: 'B2',
    });

    const afterCreator = await renderedState(creator);
    const afterInvited = await renderedState(invited);

    if (
      afterCreator.moveNumber !== 2 ||
      JSON.stringify(afterCreator.board) !==
        JSON.stringify(afterInvited.board) ||
      afterCreator.selectableCoords.length !== 0 ||
      afterInvited.selectableCoords.length === 0 ||
      afterCreator.historyLength !== 1 ||
      afterInvited.historyLength !== 1 ||
      afterCreator.historyCursor !== 1 ||
      afterCreator.lastMove?.source !== 'A1' ||
      afterCreator.lastMove.target !== 'B2'
    ) {
      throw new Error('Committed move did not converge across both browsers.');
    }

    if (!(await creator.getByRole('button', { name: 'Cell A6' }).isDisabled())) {
      throw new Error('The waiting participant can click an opponent checker.');
    }
    await assertReadOnlyHistory(creator, 1);
    await assertReadOnlyHistory(invited, 1);

    await creator.screenshot({
      fullPage: true,
      path: path.join(outputDir, 'desktop-after-move.png'),
    });
    await invited.screenshot({
      fullPage: true,
      path: path.join(outputDir, 'mobile-after-move.png'),
    });

    await commitMove({
      action: 'Climb',
      actor: invited,
      creator,
      invited,
      revision: 2,
      source: 'A6',
      target: 'B5',
    });
    await commitMove({
      action: 'Climb',
      actor: creator,
      creator,
      invited,
      revision: 3,
      source: 'C1',
      target: 'D2',
    });
    await commitMove({
      action: 'Climb',
      actor: invited,
      creator,
      invited,
      revision: 4,
      source: 'C6',
      target: 'D5',
    });
    await commitMove({
      action: 'Friendly transfer',
      actor: creator,
      creator,
      invited,
      revision: 5,
      source: 'B2',
      target: 'D2',
    });

    const transferCreator = await renderedState(creator);
    const transferInvited = await renderedState(invited);
    if (
      transferCreator.historyLength !== 5 ||
      transferInvited.historyLength !== 5 ||
      transferCreator.lastMove?.source !== 'B2' ||
      transferCreator.lastMove.target !== 'D2' ||
      transferInvited.lastMove?.source !== 'B2' ||
      transferInvited.lastMove.target !== 'D2' ||
      transferCreator.board.B2.length !== 1 ||
      transferCreator.board.D2.length !== 3 ||
      JSON.stringify(transferCreator.board) !==
        JSON.stringify(transferInvited.board)
    ) {
      throw new Error('Configured non-adjacent friendly transfer did not converge.');
    }
    await assertReadOnlyHistory(creator, 5);
    await assertReadOnlyHistory(invited, 5);

    await creator.screenshot({
      fullPage: true,
      path: path.join(outputDir, 'desktop-friendly-transfer.png'),
    });
    await invited.screenshot({
      fullPage: true,
      path: path.join(outputDir, 'mobile-friendly-transfer.png'),
    });

    if (errors.length) {
      throw new Error(`Browser console errors:\n${errors.join('\n')}`);
    }

    await writeFile(
      path.join(outputDir, 'state.json'),
      `${JSON.stringify({
        afterCreator,
        afterInvited,
        transferCreator,
        transferInvited,
      }, null, 2)}\n`,
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
