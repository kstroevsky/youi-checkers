import {
  getCell,
  getController,
  isFullStackOwnedByPlayer,
} from '@/domain/model/board';
import { FRONT_HOME_ROW, HOME_ROWS } from '@/domain/model/constants';
import { allCoords, parseCoord } from '@/domain/model/coordinates';
import type { EngineState, Player } from '@/domain/model/types';

const PLAYER_CHECKER_COUNT = 18;
const REQUIRED_FRONT_STACKS = 6;
const MAX_TRAVEL_DISTANCE = PLAYER_CHECKER_COUNT * 3;
const MAX_PURE_FRONT_FILL = REQUIRED_FRONT_STACKS * 3 * 3;

export type FinishingGoal = 'home' | 'sixStack';

export type FinishingProgress = {
  controlledStacks: number;
  frontCompletedStacks: number;
  frontForeignCheckers: number;
  frontOwnCheckers: number;
  goal: FinishingGoal;
  homeCheckers: number;
  homeReadiness: number;
  homeSingles: number;
  score: number;
  sixStackReadiness: number;
};

function distanceToHome(row: number, player: Player): number {
  if (HOME_ROWS[player].has(row)) {
    return 0;
  }

  return player === 'white' ? 4 - row : row - 3;
}

function distanceToFront(row: number, player: Player): number {
  return Math.abs(row - FRONT_HOME_ROW[player]);
}

/**
 * Produces the canonical after-win progress projection used by search and
 * observability. It describes progress toward the real victory predicates;
 * it never changes legality, turn flow, or normal-game evaluation.
 */
export function getFinishingProgress(
  state: EngineState,
  player: Player,
  preferredGoal?: FinishingGoal,
): FinishingProgress {
  let controlledStacks = 0;
  let frontCompletedStacks = 0;
  let frontForeignCheckers = 0;
  let frontOwnCheckers = 0;
  let frontPureFill = 0;
  let frontTravelDistance = 0;
  let homeCheckers = 0;
  let homeSingles = 0;
  let homeStackDebt = 0;
  let homeTravelDistance = 0;

  for (const coord of allCoords()) {
    const cell = getCell(state.board, coord);
    const { row } = parseCoord(coord);
    const ownCheckers = cell.checkers.filter(
      (checker) => checker.owner === player,
    ).length;
    const foreignCheckers = cell.checkers.length - ownCheckers;

    if (
      cell.checkers.length >= 2 &&
      getController(state.board, coord) === player
    ) {
      controlledStacks += 1;
    }

    if (
      ownCheckers === 1 &&
      cell.checkers.length === 1 &&
      HOME_ROWS[player].has(row)
    ) {
      homeSingles += 1;
    }

    if (HOME_ROWS[player].has(row)) {
      homeCheckers += ownCheckers;
    }

    homeTravelDistance += ownCheckers * distanceToHome(row, player);
    frontTravelDistance += ownCheckers * distanceToFront(row, player);

    if (cell.checkers.length >= 2) {
      homeStackDebt += ownCheckers;
    }

    if (row !== FRONT_HOME_ROW[player]) {
      continue;
    }

    frontOwnCheckers += ownCheckers;
    frontForeignCheckers += foreignCheckers;

    if (foreignCheckers === 0) {
      frontPureFill += ownCheckers * ownCheckers;
    }

    if (isFullStackOwnedByPlayer(state.board, coord, player)) {
      frontCompletedStacks += 1;
    }
  }

  const homeReadiness =
    (homeSingles / PLAYER_CHECKER_COUNT) * 0.72 +
    (homeCheckers / PLAYER_CHECKER_COUNT) * 0.16 +
    (1 - homeTravelDistance / MAX_TRAVEL_DISTANCE) * 0.08 +
    (1 - homeStackDebt / PLAYER_CHECKER_COUNT) * 0.04;
  const sixStackReadiness =
    (frontCompletedStacks / REQUIRED_FRONT_STACKS) * 0.72 +
    (frontOwnCheckers / PLAYER_CHECKER_COUNT) * 0.2 +
    (frontPureFill / MAX_PURE_FRONT_FILL) * 0.08 -
    (frontForeignCheckers / PLAYER_CHECKER_COUNT) * 0.08;
  const goal =
    preferredGoal ?? (homeReadiness > sixStackReadiness ? 'home' : 'sixStack');
  const score =
    goal === 'home'
      ? homeSingles * 20_000 +
        homeCheckers * 500 -
        homeTravelDistance * 80 -
        homeStackDebt * 100
      : frontCompletedStacks * 60_000 +
        frontOwnCheckers * 500 +
        frontPureFill * 100 -
        frontForeignCheckers * 1_000 -
        frontTravelDistance * 80;

  return {
    controlledStacks,
    frontCompletedStacks,
    frontForeignCheckers,
    frontOwnCheckers,
    goal,
    homeCheckers,
    homeReadiness,
    homeSingles,
    score,
    sixStackReadiness,
  };
}
