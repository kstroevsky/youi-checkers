import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { createAiBehaviorProfile } from '../src/ai/behavior';
import { chooseComputerAction } from '../src/ai/search/rootSearch';
import { encodeActionIndex } from '../src/ai/model/actionSpace';
import { encodeStateForModel } from '../src/ai/model/encoding';
import { createEmptyBoard } from '../src/domain/model/board';
import { BOARD_COLUMNS } from '../src/domain/model/constants';
import { createCoord, parseCoord } from '../src/domain/model/coordinates';
import { withRuleDefaults } from '../src/domain/model/ruleConfig';
import type { Coord, GameState, Player, TurnAction } from '../src/domain/model/types';
import { applyAction, createInitialState } from '../src/domain';

type Difficulty = 'easy' | 'medium' | 'hard';

type DatasetEntry = {
  intent: 'home' | 'hybrid' | 'sixStack';
  planes: number[];
  policy: Array<{ index: number; probability: number }>;
  value: number;
};

type PendingSample = {
  action: TurnAction | null;
  intent: DatasetEntry['intent'];
  player: Player;
  rootCandidates: ReturnType<typeof chooseComputerAction>['rootCandidates'];
  state: GameState;
};

function createSeededRandom(seed = 1): () => number {
  let current = seed >>> 0;

  return () => {
    current = (current * 1_664_525 + 1_013_904_223) >>> 0;
    return current / 0x1_0000_0000;
  };
}

function parseArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));

  return arg ? arg.slice(prefix.length) : fallback;
}

function mirrorCoord(coord: Coord): Coord {
  const { column, row } = parseCoord(coord);
  const columnIndex = BOARD_COLUMNS.indexOf(column);
  const mirroredColumn = BOARD_COLUMNS[BOARD_COLUMNS.length - 1 - columnIndex];

  return createCoord(mirroredColumn, row);
}

function mirrorAction(action: TurnAction): TurnAction {
  switch (action.type) {
    case 'manualUnfreeze':
      return {
        ...action,
        coord: mirrorCoord(action.coord),
      };
    case 'jumpSequence':
      return {
        ...action,
        path: action.path.map(mirrorCoord),
        source: mirrorCoord(action.source),
      };
    default:
      return {
        ...action,
        source: mirrorCoord(action.source),
        target: mirrorCoord(action.target),
      };
  }
}

function mirrorState(state: GameState): GameState {
  const board = createEmptyBoard();

  for (const coord of Object.keys(state.board) as Coord[]) {
    const mirrored = mirrorCoord(coord);
    board[mirrored].checkers = state.board[coord].checkers.map((checker) => ({ ...checker }));
  }

  return {
    ...state,
    board,
    history: [],
    pendingJump: state.pendingJump
      ? {
          ...state.pendingJump,
          source: mirrorCoord(state.pendingJump.source),
        }
      : null,
    positionCounts: {},
  };
}

function sparsePolicyFromCandidates(
  rootCandidates: PendingSample['rootCandidates'],
): Array<{ index: number; probability: number }> {
  if (!rootCandidates.length) {
    return [];
  }

  const maxScore = Math.max(...rootCandidates.map((candidate) => candidate.score));
  const weighted = rootCandidates
    .map((candidate) => {
      const index = encodeActionIndex(candidate.action);

      if (index === null) {
        return null;
      }

      return {
        index,
        weight: Math.exp((candidate.score - maxScore) / 120),
      };
    })
    .filter(Boolean) as Array<{ index: number; weight: number }>;
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0) || 1;

  return weighted.map((entry) => ({
    index: entry.index,
    probability: entry.weight / totalWeight,
  }));
}

function outcomeValue(state: GameState, perspective: Player): number {
  if (state.victory.type === 'none') {
    return 0;
  }

  if (state.victory.type === 'threefoldDraw' || state.victory.type === 'stalemateDraw') {
    return 0;
  }

  return state.victory.winner === perspective ? 1 : -1;
}

function toDatasetEntry(sample: PendingSample, terminalState: GameState): DatasetEntry[] {
  const baseEntry: DatasetEntry = {
    intent: sample.intent,
    planes: Array.from(encodeStateForModel(sample.state)),
    policy: sparsePolicyFromCandidates(sample.rootCandidates),
    value: outcomeValue(terminalState, sample.player),
  };
  const mirroredState = mirrorState(sample.state);
  const mirroredCandidates = sample.rootCandidates.map((candidate) => ({
    ...candidate,
    action: mirrorAction(candidate.action),
  }));
  const mirroredEntry: DatasetEntry = {
    intent: sample.intent,
    planes: Array.from(encodeStateForModel(mirroredState)),
    policy: sparsePolicyFromCandidates(mirroredCandidates),
    value: baseEntry.value,
  };

  return [baseEntry, mirroredEntry];
}

async function main() {
  const difficulty = parseArg('difficulty', 'hard') as Difficulty;
  const games = Number.parseInt(parseArg('games', '32'), 10);
  const maxTurns = Number.parseInt(parseArg('max-turns', '120'), 10);
  const output = parseArg('out', 'output/training/self-play.jsonl');
  const ruleConfig = withRuleDefaults({
    drawRule: 'threefold',
    scoringMode: 'off',
  });
  const entries: DatasetEntry[] = [];

  for (let gameIndex = 0; gameIndex < games; gameIndex += 1) {
    let state = createInitialState(ruleConfig);
    const random = createSeededRandom(gameIndex + 1);
    const whiteBehaviorProfile = createAiBehaviorProfile(`selfplay-white-${gameIndex + 1}`);
    const blackBehaviorProfile = createAiBehaviorProfile(`selfplay-black-${gameIndex + 1}`);
    const pending: PendingSample[] = [];

    for (let turn = 0; turn < maxTurns && state.status !== 'gameOver'; turn += 1) {
      const result = chooseComputerAction({
        behaviorProfile:
          state.currentPlayer === 'white' ? whiteBehaviorProfile : blackBehaviorProfile,
        difficulty,
        random,
        ruleConfig,
        state,
      });

      pending.push({
        action: result.action,
        intent: result.strategicIntent,
        player: state.currentPlayer,
        rootCandidates: result.rootCandidates,
        state,
      });

      if (!result.action) {
        break;
      }

      state = applyAction(state, result.action, ruleConfig);
    }

    for (const sample of pending) {
      entries.push(...toDatasetEntry(sample, state));
    }
  }

  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(
    output,
    `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    'utf8',
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
