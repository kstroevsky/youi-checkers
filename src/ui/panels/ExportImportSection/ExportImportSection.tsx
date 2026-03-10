import { startTransition } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useGameStore } from '@/app/providers/GameStoreProvider';
import { text } from '@/shared/i18n/catalog';
import { Button } from '@/ui/primitives/Button';
import { Panel } from '@/ui/primitives/Panel';

import styles from './style.module.scss';

export function ExportImportSection() {
  const {
    exportBuffer,
    importBuffer,
    importError,
    language,
    onImportBufferChange,
    onImportSession,
    onRefreshExport,
  } = useGameStore(
    useShallow((state) => ({
      exportBuffer: state.exportBuffer,
      importBuffer: state.importBuffer,
      importError: state.importError,
      language: state.preferences.language,
      onImportBufferChange: state.setImportBuffer,
      onImportSession: state.importSessionFromBuffer,
      onRefreshExport: state.refreshExportBuffer,
    })),
  );

  return (
    <Panel className={styles.root}>
      <div className={styles.header}>
        <h2>{text(language, 'exportImport')}</h2>
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => startTransition(() => onRefreshExport())}>
          {text(language, 'refreshExport')}
        </Button>
      </div>
      <label className={styles.fieldLabel} htmlFor="export-session">
        {text(language, 'currentSessionJson')}
      </label>
      <textarea id="export-session" className={styles.textarea} readOnly value={exportBuffer} />
      <label className={styles.fieldLabel} htmlFor="import-session">
        {text(language, 'importJson')}
      </label>
      <textarea
        id="import-session"
        className={styles.textarea}
        value={importBuffer}
        onChange={(event) => onImportBufferChange(event.target.value)}
      />
      {importError ? <p className={styles.error}>{text(language, 'importFailed')}</p> : null}
      <div className={styles.actions}>
        <Button onClick={onImportSession}>{text(language, 'importSession')}</Button>
      </div>
    </Panel>
  );
}
