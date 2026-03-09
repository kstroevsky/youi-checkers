import { useEffect, useRef, useState } from 'react';

import { getGlossaryEntry } from '@/features/glossary/terms';
import type { GlossaryTermId } from '@/features/glossary/terms';
import type { Language } from '@/shared/i18n/types';

type GlossaryTooltipProps = {
  language: Language;
  termId: GlossaryTermId;
};

export function GlossaryTooltip({ language, termId }: GlossaryTooltipProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const entry = getGlossaryEntry(termId, language);
  const buttonLabel =
    language === 'russian' ? `Подробнее: ${entry.title}` : `More about ${entry.title}`;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!anchorRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  return (
    <span ref={anchorRef} className="tooltip-anchor">
      <button
        type="button"
        className={`tooltip-trigger${open ? ' tooltip-trigger--open' : ''}`}
        aria-expanded={open}
        aria-label={buttonLabel}
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>
      {open ? (
        <span className="tooltip-popover" role="dialog" aria-label={entry.title}>
          <strong>{entry.title}</strong>
          <span>{entry.description}</span>
        </span>
      ) : null}
    </span>
  );
}
