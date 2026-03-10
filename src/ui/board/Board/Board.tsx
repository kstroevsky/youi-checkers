import { memo } from 'react';

import type { Board as GameBoard, Coord } from '@/domain';
import { displayCoords, parseCoord } from '@/domain/model/coordinates';
import { text } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';

import { BoardCell } from '@/ui/cells/BoardCell';

import styles from './style.module.scss';

type BoardProps = {
  board: GameBoard;
  language: Language;
  legalTargets: Coord[];
  selectedCell: Coord | null;
  selectableCoords: Coord[];
  onSelectCell: (coord: Coord) => void;
};

const DISPLAY_CELLS = displayCoords().map((coord) => ({
  coord,
  isDarkField: parseCoord(coord).row <= 3,
}));

export const Board = memo(function Board({
  board,
  language,
  legalTargets,
  selectedCell,
  selectableCoords,
  onSelectCell,
}: BoardProps) {
  const selectable = new Set(selectableCoords);
  const targets = new Set(legalTargets);

  return (
    <section className={styles.root} aria-label={text(language, 'boardAriaLabel')}>
      <div className={styles.frame}>
        <div className={styles.layout}>
          <div className={styles.axisRows}>
            {[6, 5, 4, 3, 2, 1].map((row) => (
              <span key={row}>{row}</span>
            ))}
          </div>
          <div className={styles.gridWrap}>
            <div className={styles.grid}>
              {DISPLAY_CELLS.map(({ coord, isDarkField }) => (
                <BoardCell
                  key={coord}
                  cell={board[coord]}
                  coord={coord}
                  isDarkField={isDarkField}
                  language={language}
                  isLegalTarget={targets.has(coord)}
                  isSelected={selectedCell === coord}
                  isSelectable={selectable.has(coord)}
                  onClick={onSelectCell}
                />
              ))}
            </div>
            <div className={styles.axisColumns}>
              {['A', 'B', 'C', 'D', 'E', 'F'].map((column) => (
                <span key={column}>{column}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
