import { memo } from 'react';

import type { Checker } from '@/domain';
import { cx } from '@/shared/utils/cx';

import styles from './style.module.scss';

type CheckerStackProps = {
  checkers: Checker[];
  emphasized?: boolean;
};

function checkerTone(owner: Checker['owner']): string {
  return owner === 'white' ? styles.checkerWhite : styles.checkerBlack;
}

export const CheckerStack = memo(function CheckerStack({
  checkers,
  emphasized = false,
}: CheckerStackProps) {
  return (
    <div className={cx(styles.root, emphasized && styles.emphasized)} aria-hidden="true">
      {checkers.map((checker, index) => {
        const offset = (checkers.length - index - 1) * 8;
        const isSingleFrozen = checkers.length === 1 && checker.frozen;

        return (
          <div
            key={checker.id}
            className={cx(styles.checker, checkerTone(checker.owner))}
            style={{ transform: `translateY(${offset}px)` }}
          >
            <svg viewBox="0 0 100 100" className={styles.svg}>
              <circle cx="50" cy="50" r="45" className={styles.outer} />
              <circle cx="50" cy="50" r="28" className={styles.middle} />
              <circle cx="50" cy="50" r="14" className={styles.inner} />
              {isSingleFrozen ? (
                <>
                  <line x1="24" y1="24" x2="76" y2="76" className={styles.freeze} />
                  <line x1="76" y1="24" x2="24" y2="76" className={styles.freeze} />
                </>
              ) : null}
            </svg>
          </div>
        );
      })}
    </div>
  );
});
