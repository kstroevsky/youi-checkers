import type { Cell, Coord } from '@/domain';

import { CheckerStack } from '@/ui/pieces/CheckerStack';

type BoardCellProps = {
  cell: Cell;
  coord: Coord;
  isDarkField: boolean;
  isLegalTarget: boolean;
  isSelected: boolean;
  isSelectable: boolean;
  onClick: (coord: Coord) => void;
};

export function BoardCell({
  cell,
  coord,
  isDarkField,
  isLegalTarget,
  isSelected,
  isSelectable,
  onClick,
}: BoardCellProps) {
  return (
    <button
      type="button"
      className={[
        'board-cell',
        isDarkField ? 'board-cell--dark' : 'board-cell--light',
        isSelected ? 'board-cell--selected' : '',
        isLegalTarget ? 'board-cell--target' : '',
        isSelectable ? 'board-cell--selectable' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onClick(coord)}
      aria-label={`Cell ${coord}`}
    >
      {cell.checkers.length ? (
        <CheckerStack checkers={cell.checkers} emphasized={isSelected || isLegalTarget} />
      ) : null}
      {isLegalTarget ? <span className="board-cell__marker" /> : null}
    </button>
  );
}
