import { GameControlPanel } from '@/ui/panels/GameControlPanel';
import { MoveInputPanel } from '@/ui/panels/MoveInputPanel';
import { OnlineMatchPanel } from '@/ui/panels/OnlineMatchPanel';
import { SeriesScoreboard } from '@/ui/panels/SeriesScoreboard';
import { TurnSummaryStrip } from '@/ui/panels/StatusSection';
import { Panel } from '@/ui/primitives/Panel';
import { useIsMobileViewport } from '@/shared/hooks/useIsMobileViewport';

import { BoardStage } from './BoardStage';
import { DesktopScoreStrip } from './DesktopScoreStrip';
import { MobileGameTray } from './MobileGameTray';
import styles from './style.module.scss';

export function GameTab() {
  const isCompactLayout = useIsMobileViewport(960);

  return (
    <div
      className={styles.root}
      role="tabpanel"
      data-layout={isCompactLayout ? 'compact' : 'desktop'}
    >
      <OnlineMatchPanel />
      {isCompactLayout ? (
        <div className={styles.compactShell}>
          <SeriesScoreboard />
          <div className={styles.boardSlot}>
            <BoardStage />
          </div>
          <Panel className={styles.summaryPanel}>
            <TurnSummaryStrip compact />
            <MoveInputPanel />
          </Panel>
          <MobileGameTray />
        </div>
      ) : (
        <>
          <SeriesScoreboard />
          <DesktopScoreStrip />
          <div className={styles.layout}>
            <div className={styles.boardSlot}>
              <BoardStage />
            </div>
            <div className={styles.panelSlot}>
              <GameControlPanel />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
