import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { getGlossaryEntry } from '@/features/glossary/terms';
import type { GlossaryTermId } from '@/features/glossary/terms';
import type { Language } from '@/shared/i18n/types';

import styles from './style.module.scss';

type GlossaryTooltipProps = {
  language: Language;
  termId: GlossaryTermId;
};

const TOOLTIP_OPEN_EVENT = 'wmbl:tooltip-open';

export function GlossaryTooltip({ language, termId }: GlossaryTooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLSpanElement | null>(null);
  const entry = getGlossaryEntry(termId, language);
  const buttonLabel =
    language === 'russian' ? `Подробнее: ${entry.title}` : `More about ${entry.title}`;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      const isInsideAnchor = anchorRef.current?.contains(target);
      const isInsidePopover = popoverRef.current?.contains(target);

      if (!isInsideAnchor && !isInsidePopover) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    function handleTooltipOpen(event: Event) {
      const detail = (event as CustomEvent<{ id?: string }>).detail;

      if (detail.id !== id) {
        setOpen(false);
      }
    }

    document.addEventListener(TOOLTIP_OPEN_EVENT, handleTooltipOpen);

    return () => {
      document.removeEventListener(TOOLTIP_OPEN_EVENT, handleTooltipOpen);
    };
  }, [id]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function updatePosition() {
      const anchor = anchorRef.current;

      if (!anchor) {
        return;
      }

      const rect = anchor.getBoundingClientRect();

      setPosition({
        top: rect.bottom + 6,
        left: rect.right,
      });
    }

    updatePosition();

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  function toggleOpen() {
    setOpen((value) => {
      const next = !value;

      if (next) {
        document.dispatchEvent(new CustomEvent(TOOLTIP_OPEN_EVENT, { detail: { id } }));
      }

      return next;
    });
  }

  return (
    <span ref={anchorRef} className={styles.anchor}>
      <button
        type="button"
        className={styles.trigger}
        data-open={open || undefined}
        aria-expanded={open}
        aria-controls={`tooltip-${id}`}
        aria-label={buttonLabel}
        onClick={toggleOpen}
      >
        ?
      </button>
      {open
        ? createPortal(
            <span
              ref={popoverRef}
              id={`tooltip-${id}`}
              className={styles.popover}
              role="tooltip"
              aria-label={entry.title}
              style={{ top: position.top, left: position.left }}
            >
              <strong>{entry.title}</strong>
              <span>{entry.description}</span>
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
