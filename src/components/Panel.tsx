import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TooltipLayer } from './Tooltip';

/**
 * Shared panel chrome. Every panel carries the same three affordances:
 *
 * - a title row with optional trailing status,
 * - a bottom edge that drags to set the panel's height (double-click to fit),
 * - a pop-out control that moves the panel into its own window, falling back to
 *   a full-screen sheet when the browser blocks the window.
 *
 * The popped-out view is the same panel chrome and stylesheet as the in-layout
 * panel, not a separate modal look.
 */

interface PanelProps {
  title: string;
  trailing?: ReactNode;
  /** Sits immediately after the title — used for the chain-bench colour legend. */
  afterTitle?: ReactNode;
  /** Describes the panel itself on hover. */
  tip: string;
  /** Fill the remaining column height instead of hugging the content. */
  grow?: boolean;
  /** Starting body height in px; the panel is resizable either way. */
  defaultHeight?: number;
  children: ReactNode;
  onDragEnd?: () => void;
}

const MIN_HEIGHT = 120;
const STYLE_MARK = 'data-msab-style';

interface ChromeProps {
  title: string;
  trailing?: ReactNode;
  afterTitle?: ReactNode;
  tip: string;
  popped: boolean;
  onToggle: () => void;
}

function PanelChrome({ title, trailing, afterTitle, tip, popped, onToggle }: ChromeProps) {
  return (
    <div className="panel-head">
      <span className="panel-title" data-tip={tip}>
        {title}
      </span>
      {afterTitle}
      {trailing !== undefined && <span className="count">{trailing}</span>}
      <button
        className="panel-btn"
        data-tip={
          popped ? 'Bring this panel back into the layout' : `Open ${title} in its own window`
        }
        aria-label={popped ? `Return ${title}` : `Pop out ${title}`}
        onClick={onToggle}
      >
        {popped ? '⤡' : '⤢'}
      </button>
    </div>
  );
}

export function Panel({
  title,
  trailing,
  afterTitle,
  tip,
  grow,
  defaultHeight,
  children,
  onDragEnd,
}: PanelProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [height, setHeight] = useState<number | null>(defaultHeight ?? null);
  const [popped, setPopped] = useState<'window' | 'sheet' | null>(null);

  function startResize(e: PointerEvent<HTMLDivElement>) {
    const panel = ref.current;
    if (!panel) return;
    const startY = e.clientY;
    const startH = panel.getBoundingClientRect().height;
    e.preventDefault();

    const move = (ev: globalThis.PointerEvent) =>
      setHeight(Math.max(MIN_HEIGHT, startH + ev.clientY - startY));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing-v');
    };
    document.body.classList.add('resizing-v');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const chromeProps: ChromeProps = {
    title,
    trailing,
    afterTitle,
    tip,
    popped: !!popped,
    onToggle: () => setPopped(popped ? null : 'window'),
  };

  const detached = (
    <div className="panel-detached">
      <p>{title} is open in its own window.</p>
      <button className="btn" onClick={() => setPopped(null)}>
        Bring it back
      </button>
    </div>
  );

  return (
    <section
      ref={ref}
      className={[
        'panel',
        grow && !height ? 'grow' : '',
        height ? 'sized' : '',
        popped ? 'is-detached' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={height ? { height } : undefined}
      onDragEnd={onDragEnd}
    >
      <PanelChrome {...chromeProps} />
      {popped ? detached : <div className="panel-body">{children}</div>}

      <div
        className="panel-grip"
        data-tip="Drag to resize this panel; double-click to fit its contents"
        onPointerDown={startResize}
        onDoubleClick={() => setHeight(null)}
      />

      {popped === 'window' && (
        <PopOutWindow
          title={title}
          trailing={trailing}
          afterTitle={afterTitle}
          tip={tip}
          onClose={() => setPopped(null)}
          onBlocked={() => setPopped('sheet')}
        >
          {children}
        </PopOutWindow>
      )}

      {popped === 'sheet' && (
        <div className="overlay popout-overlay" onClick={() => setPopped(null)}>
          <div className="panel popout-panel" onClick={(e) => e.stopPropagation()}>
            <PanelChrome {...chromeProps} />
            <div className="panel-body">{children}</div>
          </div>
        </div>
      )}
    </section>
  );
}

interface PopOutProps {
  title: string;
  trailing?: ReactNode;
  afterTitle?: ReactNode;
  tip: string;
  onClose: () => void;
  onBlocked: () => void;
  children: ReactNode;
}

/**
 * A real second window. Styles, fonts and the Luma tokens are mirrored from the
 * app document so the panel is the same UI, not a browser-default page.
 */
function PopOutWindow({
  title,
  trailing,
  afterTitle,
  tip,
  onClose,
  onBlocked,
  children,
}: PopOutProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const close = useRef(onClose);
  const blocked = useRef(onBlocked);
  close.current = onClose;
  blocked.current = onBlocked;

  useEffect(() => {
    const win = window.open(
      '',
      `msab-${title.replace(/\W+/g, '-').toLowerCase()}`,
      'width=780,height=880',
    );
    if (!win) {
      blocked.current();
      return;
    }

    let mount: HTMLElement | null = null;
    let disposed = false;

    /**
     * about:blank finishes loading asynchronously and clears whatever was
     * written before it did, so attaching has to be repeatable rather than a
     * one-shot at open time.
     */
    function attach() {
      if (disposed) return;
      const doc = win!.document;
      if (!doc?.body) return;

      doc.title = `${title} — Protein Chain Designer`;
      paintPopoutDocument(document, doc);

      if (!mount || !mount.isConnected) {
        mount = mount ?? doc.createElement('div');
        mount.className = 'popout-root';
        doc.body.appendChild(mount);
        setHost(mount);
      }
    }

    attach();
    win.addEventListener('load', attach);

    const observer = new MutationObserver(() => {
      if (!disposed && win.document.head) paintPopoutDocument(document, win.document);
    });
    observer.observe(document.head, { childList: true, subtree: true });

    /**
     * Some hosts — Electron shells and embedded IDE browsers among them — turn
     * window.open into a tab that never renders what we write to it. A real
     * window reports its own layout, so zero metrics mean the panel would be
     * invisible there and the sheet is the honest answer instead.
     */
    const settle = window.setTimeout(() => {
      if (disposed) return;
      attach();
      const rendered =
        !win.closed &&
        win.innerWidth > 0 &&
        !!mount?.isConnected &&
        (mount?.getBoundingClientRect().width ?? 0) > 0;
      if (!rendered) {
        win.close();
        blocked.current();
      }
    }, 400);

    const onUnload = () => close.current();
    win.addEventListener('pagehide', onUnload);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearTimeout(settle);
      win.removeEventListener('load', attach);
      win.removeEventListener('pagehide', onUnload);
      win.close();
    };
  }, [title]);

  if (!host) return null;

  return createPortal(
    <>
      <div className="panel popout-panel">
        <PanelChrome
          title={title}
          trailing={trailing}
          afterTitle={afterTitle}
          tip={tip}
          popped
          onToggle={onClose}
        />
        <div className="panel-body">{children}</div>
      </div>
      <TooltipLayer doc={host.ownerDocument} />
    </>,
    host,
  );
}

/**
 * Cross-document cloneNode often yields empty <style> tags in Chromium, so the
 * pop-out would fall back to the browser's default type. importNode + rewriting
 * textContent, absolute stylesheet hrefs, and the live :root tokens keep the
 * popped document on the same design system as the workbench.
 */
function paintPopoutDocument(source: Document, target: Document) {
  const head = target.head;
  const html = target.documentElement;
  if (!head || !target.body) return;

  html.lang = source.documentElement.lang || 'en';
  html.style.colorScheme = 'light';

  const tokens = getComputedStyle(source.documentElement);
  for (const name of Array.from(tokens)) {
    if (name.startsWith('--')) html.style.setProperty(name, tokens.getPropertyValue(name));
  }

  const body = getComputedStyle(source.body);
  target.body.style.margin = '0';
  target.body.style.background = body.backgroundColor;
  target.body.style.color = body.color;
  target.body.style.fontFamily = body.fontFamily;
  target.body.style.fontSize = body.fontSize;
  target.body.style.fontWeight = body.fontWeight;
  target.body.style.lineHeight = body.lineHeight;
  target.body.style.setProperty('-webkit-font-smoothing', 'antialiased');

  if (!head.querySelector(`meta[${STYLE_MARK}]`)) {
    const meta = target.createElement('meta');
    meta.setAttribute('name', 'color-scheme');
    meta.setAttribute('content', 'light');
    meta.setAttribute(STYLE_MARK, '');
    head.appendChild(meta);
  }

  head.querySelectorAll(`style[${STYLE_MARK}], link[${STYLE_MARK}]`).forEach((node) => node.remove());

  source
    .querySelectorAll('link[rel="preconnect"], link[rel="stylesheet"], style')
    .forEach((node) => {
      const copy = target.importNode(node, true) as HTMLElement;
      copy.setAttribute(STYLE_MARK, '');
      if (node instanceof HTMLLinkElement && copy instanceof HTMLLinkElement) {
        copy.href = node.href;
        if (node.crossOrigin) copy.crossOrigin = node.crossOrigin;
      }
      if (node instanceof HTMLStyleElement && copy instanceof HTMLStyleElement) {
        copy.textContent = node.textContent;
      }
      head.appendChild(copy);
    });

  for (const sheet of source.adoptedStyleSheets) {
    try {
      const style = target.createElement('style');
      style.setAttribute(STYLE_MARK, '');
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
      head.appendChild(style);
    } catch {
      /* constructed sheets from another origin cannot be read */
    }
  }
}
