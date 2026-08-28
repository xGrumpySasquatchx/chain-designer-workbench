import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PLATE_PALETTES, paletteById, type ColorPalette } from '../model/palettes';

export function PaletteSelect({
  value,
  onChange,
  align = 'start',
}: {
  value: string;
  onChange: (paletteId: string) => void;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const selected = paletteById(value);

  useEffect(() => {
    if (!open) return;
    const view = (rootRef.current?.ownerDocument ?? document).defaultView ?? window;
    const place = () => {
      const box = triggerRef.current?.getBoundingClientRect();
      if (!box) return;
      setMenuStyle(
        align === 'end'
          ? { position: 'fixed', top: box.bottom + 4, right: view.innerWidth - box.right, left: 'auto' }
          : { position: 'fixed', top: box.bottom + 4, left: box.left },
      );
    };
    place();
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    view.addEventListener('pointerdown', onPointer);
    view.addEventListener('keydown', onKey);
    view.addEventListener('resize', place);
    return () => {
      view.removeEventListener('pointerdown', onPointer);
      view.removeEventListener('keydown', onKey);
      view.removeEventListener('resize', place);
    };
  }, [open, align]);

  return (
    <div className={`palette-select${open ? ' open' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="palette-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        data-tip="Choose a colour palette for well components"
        onClick={() => setOpen((v) => !v)}
      >
        <PaletteStrip palette={selected} />
        <span className="palette-select-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          className="palette-select-menu"
          role="listbox"
          aria-label="Well colour palettes"
          style={menuStyle}
        >
          {PLATE_PALETTES.map((palette) => {
            const isOn = palette.id === selected.id;
            return (
              <button
                key={palette.id}
                type="button"
                role="option"
                aria-selected={isOn}
                className={`palette-select-option${isOn ? ' selected' : ''}`}
                data-tip={palette.name}
                onClick={() => {
                  onChange(palette.id);
                  setOpen(false);
                }}
              >
                <PaletteStrip palette={palette} />
                <span className="palette-select-name">{palette.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PaletteStrip({ palette }: { palette: ColorPalette }) {
  const stops = palette.colors.map((color, i, all) => {
    const start = (i / all.length) * 100;
    const end = ((i + 1) / all.length) * 100;
    return `${color} ${start}% ${end}%`;
  });
  return (
    <span
      className="palette-strip"
      aria-hidden
      style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }}
    />
  );
}
