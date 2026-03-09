import type { TurnAction, TurnRecord, Victory } from '@/domain';

function formatAction(action: TurnAction): string {
  switch (action.type) {
    case 'manualUnfreeze':
      return `Unfreeze ${action.coord}`;
    case 'jumpSequence':
      return `Jump ${action.source} -> ${action.path.join(' -> ')}`;
    case 'climbOne':
      return `Climb ${action.source} -> ${action.target}`;
    case 'splitOneFromStack':
      return `Split 1 ${action.source} -> ${action.target}`;
    case 'splitTwoFromStack':
      return `Split 2 ${action.source} -> ${action.target}`;
    case 'friendlyStackTransfer':
      return `Transfer ${action.source} -> ${action.target}`;
  }
}

export function formatVictory(victory: Victory): string {
  switch (victory.type) {
    case 'none':
      return 'Active';
    case 'homeField':
      return `${victory.winner === 'white' ? 'White' : 'Black'} wins by home field`;
    case 'sixStacks':
      return `${victory.winner === 'white' ? 'White' : 'Black'} wins by six stacks`;
    case 'threefoldDraw':
      return 'Draw by threefold repetition';
    case 'stalemateDraw':
      return 'Draw by stalemate';
  }
}

export function formatTurnRecord(record: TurnRecord): string {
  const actor = record.actor === 'white' ? 'White' : 'Black';
  const autoPasses = record.autoPasses.length
    ? ` | auto-pass: ${record.autoPasses
        .map((player) => (player === 'white' ? 'White' : 'Black'))
        .join(', ')}`
    : '';

  return `${actor}: ${formatAction(record.action)}${autoPasses}`;
}
