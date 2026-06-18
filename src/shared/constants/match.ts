import type { MatchSettings } from '@/shared/types/session';

export const DEFAULT_MATCH_SETTINGS: MatchSettings = {
  opponentMode: 'hotSeat',
  humanPlayer: 'white',
  aiDifficulty: 'easy',
  gameFormat: 'single',
  targetPoints: 100,
};
