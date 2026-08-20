import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PLATE_PALETTES, paletteById, type ColorPalette } from '../model/palettes';

export function PaletteSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (paletteId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const selected = paletteById(value);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const box = triggerRef.current?.getBoundingClientRect();
      if (!box) return;
      setMenuStyle({
        position: 'fixed',
        top: box.bottom + 4,
        left: box.left,
        width: box.width,
      });
    };
    place();
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
    };
  }, [open]);

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
        <SwatchRow palette={selected} />
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
                <SwatchRow palette={palette} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SwatchRow({ palette }: { palette: ColorPalette }) {
  return (
    <span className="palette-swatches" aria-hidden>
      {palette.colors.map((color) => (
        <span key={color} className="palette-swatch" style={{ background: color }} />
      ))}
    </span>
  );
}
