import { memo } from 'react';

import type { Cell, Coord } from '@/domain';
import { text } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';

import { CheckerStack } from '@/ui/pieces/CheckerStack';

import styles from './style.module.scss';

type BoardCellProps = {
  cell: Cell;
  coord: Coord;
  isDarkField: boolean;
  isLegalTarget: boolean;
  isSelected: boolean;
  isSelectable: boolean;
  language: Language;
  onClick: (coord: Coord) => void;
};

export const BoardCell = memo(function BoardCell({
  cell,
  coord,
  isDarkField,
  isLegalTarget,
  isSelected,
  isSelectable,
  language,
  onClick,
}: BoardCellProps) {
  return (
    <button
      type="button"
      className={styles.root}
      data-tone={isDarkField ? 'dark' : 'light'}
      data-selectable={isSelectable || undefined}
      data-selected={isSelected || undefined}
      data-target={isLegalTarget || undefined}
      onClick={() => onClick(coord)}
      aria-label={`${text(language, 'cellLabel')} ${coord}`}
    >
      {cell.checkers.length ? (
        <CheckerStack checkers={cell.checkers} emphasized={isSelected || isLegalTarget} />
      ) : null}
      {isLegalTarget ? <span className={styles.marker} /> : null}
    </button>
  );
});
