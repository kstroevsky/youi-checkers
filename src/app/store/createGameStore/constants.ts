import type { RuleConfig } from '@/domain';
import type { AppPreferences } from '@/shared/types/session';

/** Fresh-store user defaults. */
export const DEFAULT_PREFERENCES: AppPreferences = {
  passDeviceOverlayEnabled: true,
  language: 'russian',
};

/** Legacy rule snapshot used to detect the old default bundle during migration. */
export const LEGACY_RULE_DEFAULTS: RuleConfig = {
  allowNonAdjacentFriendlyStackTransfer: true,
  drawRule: 'threefold',
  scoringMode: 'basic',
};

/** Small grace period added on top of the AI preset time budget. */
export const AI_WATCHDOG_BUFFER_MS = 250;

/** Short pause after an AI-authored move before the next AI turn is scheduled. */
export const AI_MOVE_REVEAL_MS = 300;
