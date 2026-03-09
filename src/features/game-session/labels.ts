import type { ActionKind, Player } from '@/domain';
import type { InteractionState } from '@/shared/types/session';

export function playerLabel(player: Player): string {
  return player === 'white' ? 'White' : 'Black';
}

export function playerLabelRu(player: Player): string {
  return player === 'white' ? 'Белые' : 'Чёрные';
}

export function actionLabel(actionKind: ActionKind): string {
  switch (actionKind) {
    case 'jumpSequence':
      return 'Jump';
    case 'manualUnfreeze':
      return 'Unfreeze';
    case 'climbOne':
      return 'Climb';
    case 'splitOneFromStack':
      return 'Split One';
    case 'splitTwoFromStack':
      return 'Split Two';
    case 'friendlyStackTransfer':
      return 'Friendly Transfer';
  }
}

export function describeInteraction(interaction: InteractionState): string {
  switch (interaction.type) {
    case 'idle':
      return 'Select a checker or controlled stack.';
    case 'pieceSelected':
      return `Selected ${interaction.source}. Choose a move type.`;
    case 'actionTypeSelected':
      return `Action ${actionLabel(interaction.actionType)} is selected.`;
    case 'choosingTarget':
      return `Choose a target for ${actionLabel(interaction.actionType)} from ${interaction.source}.`;
    case 'buildingJumpChain':
      return interaction.path.length
        ? `Jump path: ${interaction.source} -> ${interaction.path.join(' -> ')}`
        : `Build a jump path from ${interaction.source}.`;
    case 'turnResolved':
      return `Turn resolved. ${playerLabel(interaction.nextPlayer)} is next.`;
    case 'passingDevice':
      return `Pass the device to ${playerLabel(interaction.nextPlayer)}.`;
    case 'gameOver':
      return 'Game over.';
  }
}
