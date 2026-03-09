import type { Checker } from '@/domain';

type CheckerStackProps = {
  checkers: Checker[];
  emphasized?: boolean;
};

function checkerClass(owner: Checker['owner']): string {
  return owner === 'white' ? 'checker checker--white' : 'checker checker--black';
}

export function CheckerStack({ checkers, emphasized = false }: CheckerStackProps) {
  return (
    <div
      className={`checker-stack${emphasized ? ' checker-stack--emphasized' : ''}`}
      aria-hidden="true"
    >
      {checkers.map((checker, index) => {
        const offset = (checkers.length - index - 1) * 12;
        const isSingleFrozen = checkers.length === 1 && checker.frozen;

        return (
          <div
            key={checker.id}
            className={checkerClass(checker.owner)}
            style={{ transform: `translateY(${offset}px)` }}
          >
            <svg viewBox="0 0 100 100" className="checker__svg">
              <circle cx="50" cy="50" r="45" className="checker__outer" />
              <circle cx="50" cy="50" r="28" className="checker__middle" />
              <circle cx="50" cy="50" r="14" className="checker__inner" />
              {isSingleFrozen ? (
                <>
                  <line x1="24" y1="24" x2="76" y2="76" className="checker__freeze" />
                  <line x1="76" y1="24" x2="24" y2="76" className="checker__freeze" />
                </>
              ) : null}
            </svg>
          </div>
        );
      })}
    </div>
  );
}
