import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * One tooltip layer per document: it watches for anything carrying `data-tip`
 * and explains it on hover or keyboard focus. Controls describe themselves
 * that way instead of relying on the browser's own slow, unstyled title
 * tooltip, and a popped-out panel gets its own layer for its own document.
 */

interface TipState {
  text: string;
  x: number;
  y: number;
  below: boolean;
}

const DELAY_MS = 240;

export function TooltipLayer({ doc }: { doc?: Document }) {
  const [tip, setTip] = useState<TipState | null>(null);

  useEffect(() => {
    const target = doc ?? document;
    const view = target.defaultView;
    if (!view) return;

    let timer: number | undefined;
    let current: Element | null = null;

    function hide() {
      if (timer !== undefined) {
        view!.clearTimeout(timer);
        timer = undefined;
      }
      current = null;
      setTip(null);
    }

    function place(el: Element, immediate: boolean) {
      const show = () => {
        const text = el.getAttribute('data-tip');
        if (!text) return;
        const r = el.getBoundingClientRect();
        // Flip above the control when there is no room beneath it.
        const below = r.bottom + 54 < view!.innerHeight;
        setTip({
          text,
          x: Math.min(Math.max(r.left + r.width / 2, 90), view!.innerWidth - 90),
          y: below ? r.bottom + 7 : r.top - 7,
          below,
        });
      };
      if (immediate) show();
      else timer = view!.setTimeout(show, DELAY_MS);
    }

    function onOver(e: Event) {
      const from = e.target;
      const el =
        from instanceof Element ? (from.closest('[data-tip]') as Element | null) : null;
      if (el === current) return;
      hide();
      current = el;
      if (el) place(el, false);
    }

    function onFocus(e: Event) {
      const from = e.target;
      const el =
        from instanceof Element ? (from.closest('[data-tip]') as Element | null) : null;
      hide();
      current = el;
      if (el) place(el, true);
    }

    function onKey(e: Event) {
      if ((e as KeyboardEvent).key === 'Escape') hide();
    }

    target.addEventListener('pointerover', onOver, true);
    target.addEventListener('pointerdown', hide, true);
    target.addEventListener('pointerleave', hide, true);
    target.addEventListener('focusin', onFocus, true);
    target.addEventListener('focusout', hide, true);
    target.addEventListener('scroll', hide, true);
    target.addEventListener('keydown', onKey, true);
    view.addEventListener('blur', hide);

    return () => {
      hide();
      target.removeEventListener('pointerover', onOver, true);
      target.removeEventListener('pointerdown', hide, true);
      target.removeEventListener('pointerleave', hide, true);
      target.removeEventListener('focusin', onFocus, true);
      target.removeEventListener('focusout', hide, true);
      target.removeEventListener('scroll', hide, true);
      target.removeEventListener('keydown', onKey, true);
      view.removeEventListener('blur', hide);
    };
  }, [doc]);

  if (!tip) return null;

  return createPortal(
    <div
      className={`tooltip ${tip.below ? 'below' : 'above'}`}
      style={{ left: tip.x, top: tip.y }}
      role="tooltip"
    >
      {tip.text}
    </div>,
    (doc ?? document).body,
  );
}
