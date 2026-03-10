import type { ScoreSummary } from '@/domain';
import type { GlossaryTermId } from '@/features/glossary/terms';
import { text } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';
import { GlossaryTooltip } from '@/ui/tooltips/GlossaryTooltip';

import styles from './style.module.scss';

type ScoreCompactTableProps = {
  language: Language;
  scoreSummary: ScoreSummary;
};

type ScoreRow = {
  black: number;
  label: string;
  termId: GlossaryTermId;
  white: number;
};

export function ScoreCompactTable({ language, scoreSummary }: ScoreCompactTableProps) {
  const rows: ScoreRow[] = [
    {
      label: text(language, 'scoreHomeSingles'),
      termId: 'homeFieldSingles',
      white: scoreSummary.homeFieldSingles.white,
      black: scoreSummary.homeFieldSingles.black,
    },
    {
      label: text(language, 'scoreControlledStacks'),
      termId: 'controlledStacks',
      white: scoreSummary.controlledStacks.white,
      black: scoreSummary.controlledStacks.black,
    },
    {
      label: text(language, 'scoreFrontRowStacks'),
      termId: 'frontRowStacks',
      white: scoreSummary.controlledHomeRowHeightThreeStacks.white,
      black: scoreSummary.controlledHomeRowHeightThreeStacks.black,
    },
    {
      label: text(language, 'scoreFrozenEnemySingles'),
      termId: 'frozenEnemySingles',
      white: scoreSummary.frozenEnemySingles.white,
      black: scoreSummary.frozenEnemySingles.black,
    },
  ];

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <strong>{text(language, 'scoreMode')}</strong>
        <GlossaryTooltip language={language} termId="scoreMode" />
      </div>
      <div className={styles.table} role="table" aria-label={text(language, 'scoreMode')}>
        <div className={styles.row} data-head="true" role="row">
          <span role="columnheader" />
          <span role="columnheader">{text(language, 'scoreWhite')}</span>
          <span role="columnheader">{text(language, 'scoreBlack')}</span>
        </div>
        {rows.map((row) => (
          <div key={row.label} className={styles.row} role="row">
            <div className={styles.label} role="rowheader">
              <span>{row.label}</span>
              <GlossaryTooltip language={language} termId={row.termId} />
            </div>
            <span role="cell">{row.white}</span>
            <span role="cell">{row.black}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
