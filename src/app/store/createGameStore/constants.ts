import type { RuleConfig } from '@/domain';
import type { AppPreferences } from '@/shared/types/session';

/** Fresh-store user defaults. */
export const DEFAULT_PREFERENCES: AppPreferences = {
  passDeviceOverlayEnabled: true,
  language: 'english',
};

/** Legacy rule snapshot used to detect the old default bundle during migration. */
export const LEGACY_RULE_DEFAULTS: RuleConfig = {
  allowNonAdjacentFriendlyStackTransfer: true,
  drawRule: 'threefold',
  scoringMode: 'basic',
};

/** Small grace period added on top of the AI preset time budget. */
export const AI_WATCHDOG_BUFFER_MS = 800;

/** Lets the player see one landing before a forced AI jump continuation starts. */
export const AI_JUMP_STEP_REVEAL_MS = 300;
