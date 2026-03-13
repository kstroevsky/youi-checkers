import type { ActionKind, Player, TurnAction, TurnRecord, Victory } from '@/domain';
import type { Language } from '@/shared/i18n/types';
import type { InteractionState } from '@/shared/types/session';

import { ACTION_LABELS, PLAYER_LABELS } from '@/shared/i18n/catalog/labels';
import {
  INTERACTION_COPY,
  MISC_COPY,
  RESULT_TITLE_COPY,
  VICTORY_COPY,
} from '@/shared/i18n/catalog/copy';
import { TEXT, type TextKey } from '@/shared/i18n/catalog/text';

export type { TextKey } from '@/shared/i18n/catalog/text';

/** Returns localized static UI text by language and key. */
export function text(language: Language, key: TextKey): string {
  return TEXT[language][key];
}

/** Returns localized player label. */
export function playerLabel(language: Language, player: Player): string {
  return PLAYER_LABELS[language][player];
}

/** Returns localized action label used in buttons and history summaries. */
export function actionLabel(language: Language, actionKind: ActionKind): string {
  return ACTION_LABELS[language][actionKind];
}

/** Returns localized turn banner text for current actor. */
export function formatTurnBanner(language: Language, player: Player): string {
  return MISC_COPY[language].turnBanner(playerLabel(language, player));
}

/** Returns localized pass-device helper copy. */
export function formatPassOverlayLabel(language: Language, player: Player): string {
  return MISC_COPY[language].passOverlayLabel(playerLabel(language, player));
}

/** Returns localized compact history summary. */
export function formatHistorySummary(language: Language, count: number, cursor: number): string {
  return MISC_COPY[language].historySummary(count, cursor);
}

/** Returns localized glossary tooltip trigger aria-label. */
export function formatGlossaryTooltipLabel(language: Language, title: string): string {
  return MISC_COPY[language].tooltipMoreAbout(title);
}

/** Returns localized title used in game result modal. */
export function formatGameResultTitle(language: Language, victory: Victory): string {
  const copy = RESULT_TITLE_COPY[language];

  switch (victory.type) {
    case 'homeField':
    case 'sixStacks':
      return copy.winner(playerLabel(language, victory.winner));
    case 'threefoldDraw':
    case 'stalemateDraw':
      return copy.draw;
    case 'none':
      return copy.gameOver;
  }
}

/** Returns localized status line for current interaction state machine node. */
export function describeInteraction(language: Language, interaction: InteractionState): string {
  const copy = INTERACTION_COPY[language];

  switch (interaction.type) {
    case 'idle':
      return copy.idle;
    case 'pieceSelected':
      return copy.pieceSelected(interaction.source);
    case 'jumpFollowUp':
      return copy.jumpFollowUp(interaction.source);
    case 'choosingTarget':
      return copy.choosingTarget(actionLabel(language, interaction.actionType), interaction.source);
    case 'buildingJumpChain':
      return copy.buildingJumpChain(interaction.source);
    case 'turnResolved':
      return copy.turnResolved(playerLabel(language, interaction.nextPlayer));
    case 'passingDevice':
      return copy.passingDevice(playerLabel(language, interaction.nextPlayer));
    case 'gameOver':
      return copy.gameOver;
  }
}

/** Formats action payload into human-readable history entry fragment. */
export function formatAction(language: Language, action: TurnAction): string {
  switch (action.type) {
    case 'manualUnfreeze':
      return `${actionLabel(language, action.type)} ${action.coord}`;
    case 'jumpSequence':
      return `${actionLabel(language, action.type)} ${action.source} -> ${action.path.join(' -> ')}`;
    case 'climbOne':
    case 'moveSingleToEmpty':
    case 'splitOneFromStack':
    case 'splitTwoFromStack':
    case 'friendlyStackTransfer':
      return `${actionLabel(language, action.type)} ${action.source} -> ${action.target}`;
  }
}

/** Formats current victory status into localized short text. */
export function formatVictory(language: Language, victory: Victory): string {
  const copy = VICTORY_COPY[language];

  switch (victory.type) {
    case 'none':
      return copy.none;
    case 'homeField':
      return copy.homeField(playerLabel(language, victory.winner));
    case 'sixStacks':
      return copy.sixStacks(playerLabel(language, victory.winner));
    case 'threefoldDraw':
      return copy.threefoldDraw;
    case 'stalemateDraw':
      return copy.stalemateDraw;
  }
}

/** Formats one turn record for the history list in reverse chronological order. */
export function formatTurnRecord(language: Language, record: TurnRecord): string {
  const actor = playerLabel(language, record.actor);
  const autoPasses = record.autoPasses.length
    ? `${MISC_COPY[language].autoPassPrefix}${record.autoPasses
        .map((player) => playerLabel(language, player))
        .join(', ')}`
    : '';

  return `${actor}: ${formatAction(language, record.action)}${autoPasses}`;
}
