import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { getGlossaryEntry } from '@/features/glossary/terms';
import type { GlossaryTermId } from '@/features/glossary/terms';
import { text } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';
import { Button } from '@/ui/primitives/Button';

import styles from './style.module.scss';

type GlossaryTooltipProps = {
  language: Language;
  termId: GlossaryTermId;
};

const TOOLTIP_OPEN_EVENT = 'wmbl:tooltip-open';
const VIEWPORT_PADDING = 12;
const TOOLTIP_GAP = 8;
const MOBILE_BREAKPOINT = 720;

export function GlossaryTooltip({ language, termId }: GlossaryTooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [position, setPosition] = useState({
    left: VIEWPORT_PADDING,
    top: VIEWPORT_PADDING,
    maxHeight: 220,
    ready: false,
  });
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLElement | null>(null);
  const entry = getGlossaryEntry(termId, language);
  const buttonLabel =
    language === 'russian' ? `Подробнее: ${entry.title}` : `More about ${entry.title}`;

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const syncViewportMode = () => setIsMobileViewport(mediaQuery.matches);

    syncViewportMode();
    mediaQuery.addEventListener('change', syncViewportMode);

    return () => {
      mediaQuery.removeEventListener('change', syncViewportMode);
    };
  }, []);

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

  useLayoutEffect(() => {
    if (!open || isMobileViewport) {
      setPosition((current) => ({ ...current, ready: false }));
      return undefined;
    }

    function updatePosition() {
      const anchor = anchorRef.current;
      const popover = popoverRef.current;

      if (!anchor || !popover) {
        return;
      }

      const anchorRect = anchor.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const clampedLeft = Math.min(
        viewportWidth - VIEWPORT_PADDING - popoverRect.width,
        Math.max(VIEWPORT_PADDING, anchorRect.right - popoverRect.width),
      );
      const spaceBelow = viewportHeight - anchorRect.bottom - TOOLTIP_GAP - VIEWPORT_PADDING;
      const spaceAbove = anchorRect.top - TOOLTIP_GAP - VIEWPORT_PADDING;
      const placeAbove = spaceBelow < popoverRect.height && spaceAbove > spaceBelow;
      const maxHeight = Math.max(96, placeAbove ? spaceAbove : spaceBelow);
      const desiredTop = placeAbove
        ? anchorRect.top - TOOLTIP_GAP - Math.min(popoverRect.height, maxHeight)
        : anchorRect.bottom + TOOLTIP_GAP;
      const clampedTop = Math.min(
        viewportHeight - VIEWPORT_PADDING - Math.min(popoverRect.height, maxHeight),
        Math.max(VIEWPORT_PADDING, desiredTop),
      );

      setPosition({
        top: clampedTop,
        left: clampedLeft,
        maxHeight,
        ready: true,
      });
    }

    const frameId = window.requestAnimationFrame(updatePosition);

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isMobileViewport, open]);

  function toggleOpen() {
    const next = !open;

    if (next) {
      document.dispatchEvent(new CustomEvent(TOOLTIP_OPEN_EVENT, { detail: { id } }));
    }

    setOpen(next);
  }

  function setPopoverElement(node: HTMLDivElement | HTMLSpanElement | null) {
    popoverRef.current = node;
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
            isMobileViewport ? (
              <div className={styles.modalOverlay} role="presentation">
                <div
                  ref={setPopoverElement}
                  id={`tooltip-${id}`}
                  className={styles.modalPanel}
                  role="dialog"
                  aria-modal="true"
                  aria-label={entry.title}
                >
                  <strong>{entry.title}</strong>
                  <span>{entry.description}</span>
                  <Button fullWidth onClick={() => setOpen(false)}>
                    {text(language, 'continue')}
                  </Button>
                </div>
              </div>
            ) : (
              <span
                ref={setPopoverElement}
                id={`tooltip-${id}`}
                className={styles.popover}
                role="tooltip"
                aria-label={entry.title}
                style={{
                  top: position.top,
                  left: position.left,
                  maxHeight: position.maxHeight,
                  visibility: position.ready ? 'visible' : 'hidden',
                }}
              >
                <strong>{entry.title}</strong>
                <span>{entry.description}</span>
              </span>
            ),
            document.body,
          )
        : null}
    </span>
  );
}
