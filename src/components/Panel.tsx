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

  const head = (
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
        onClick={() => setPopped(popped ? null : 'window')}
      >
        {popped ? '⤡' : '⤢'}
      </button>
    </div>
  );

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
      {head}
      {/* The sheet is modal over this panel, so only a real second window
          replaces the body with a stub. */}
      {popped === 'window' ? detached : <div className="panel-body">{children}</div>}

      <div
        className="panel-grip"
        data-tip="Drag to resize this panel; double-click to fit its contents"
        onPointerDown={startResize}
        onDoubleClick={() => setHeight(null)}
      />

      {popped === 'window' && (
        <PopOutWindow
          title={title}
          onClose={() => setPopped(null)}
          onBlocked={() => setPopped('sheet')}
        >
          {children}
        </PopOutWindow>
      )}

      {popped === 'sheet' && (
        <div className="overlay" onClick={() => setPopped(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <h2>{title}</h2>
              <span style={{ marginLeft: 'auto' }} />
              <span className="hint" style={{ margin: 0 }}>
                Your browser blocked the pop-out window
              </span>
              <button className="btn" onClick={() => setPopped(null)}>
                Close
              </button>
            </div>
            <div className="sheet-body wide">{children}</div>
          </div>
        </div>
      )}
    </section>
  );
}

interface PopOutProps {
  title: string;
  onClose: () => void;
  onBlocked: () => void;
  children: ReactNode;
}

/**
 * A real second window. Stylesheets are copied across with absolute URLs so the
 * panel looks the same there, and closing the window returns the panel.
 */
function PopOutWindow({ title, onClose, onBlocked, children }: PopOutProps) {
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

      doc.title = `${title} — MsAb construct designer`;
      if (!doc.head.querySelector('[data-msab-style]')) {
        document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
          const copy = node.cloneNode(true) as HTMLElement;
          // about:blank cannot resolve the relative href the app was served with.
          if (node instanceof HTMLLinkElement && copy instanceof HTMLLinkElement) {
            copy.href = node.href;
          }
          copy.setAttribute('data-msab-style', '');
          doc.head.appendChild(copy);
        });
      }

      if (!mount || !mount.isConnected) {
        mount = mount ?? doc.createElement('div');
        mount.className = 'popout-root';
        doc.body.appendChild(mount);
        setHost(mount);
      }
    }

    attach();
    win.addEventListener('load', attach);

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
        <div className="panel-head">
          <span className="panel-title">{title}</span>
        </div>
        <div className="panel-body">{children}</div>
      </div>
      <TooltipLayer doc={host.ownerDocument} />
    </>,
    host,
  );
}
