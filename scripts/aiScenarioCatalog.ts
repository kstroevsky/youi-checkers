import { hashPosition } from '@/domain';
import type { GameState } from '@/domain/model/types';

import { createLateGamePerfState } from './lateGamePerfFixtures';

export type AiScenarioBucket =
  | 'opening'
  | 'congested'
  | 'loopPressure'
  | 'conversionRace'
  | 'lateSparse';

export type AiScenarioDefinition = {
  bucket: AiScenarioBucket;
  label: string;
  turnCount: number;
};

const RETAINED_HISTORY_WINDOW = 6;

export const POSITION_BUCKET_SCENARIOS: AiScenarioDefinition[] = [
  { bucket: 'opening', label: 'opening', turnCount: 0 },
  { bucket: 'congested', label: 'turn25', turnCount: 25 },
  { bucket: 'loopPressure', label: 'turn50', turnCount: 50 },
  { bucket: 'loopPressure', label: 'turn75', turnCount: 75 },
  { bucket: 'conversionRace', label: 'turn100', turnCount: 100 },
  { bucket: 'conversionRace', label: 'turn150', turnCount: 150 },
  { bucket: 'lateSparse', label: 'turn200', turnCount: 200 },
] as const;

/**
 * The perf traces are replayed with draw resolution disabled so they stay reachable.
 * For behavior reports we keep only the recent history window and rebuild repetition
 * counts from that window, which makes the imported late positions playable without
 * smuggling a terminal threefold state into the continuation harness.
 */
export function createContinuationScenarioState(state: GameState): GameState {
  const retainedHistory = state.history.slice(-RETAINED_HISTORY_WINDOW);
  const rebuiltPositionCounts: Record<string, number> = {};

  if (retainedHistory.length) {
    const firstBeforeHash = hashPosition(retainedHistory[0].beforeState);
    rebuiltPositionCounts[firstBeforeHash] = 1;

    for (const record of retainedHistory) {
      const afterHash = hashPosition(record.afterState);
      rebuiltPositionCounts[afterHash] = (rebuiltPositionCounts[afterHash] ?? 0) + 1;
    }
  } else {
    rebuiltPositionCounts[hashPosition(state)] = 1;
  }

  return {
    ...state,
    history: retainedHistory,
    positionCounts: rebuiltPositionCounts,
    status: 'active',
    victory: { type: 'none' },
  };
}

export function buildScenarioState(turnCount: number, ruleConfig: Parameters<typeof createLateGamePerfState>[1]): GameState {
  if (turnCount === 0) {
    return createLateGamePerfState(0, ruleConfig);
  }

  return createContinuationScenarioState(createLateGamePerfState(turnCount, ruleConfig));
}
