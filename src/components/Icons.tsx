interface IconProps {
  size?: number;
}

export function GripIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {[3, 8, 13].map((y) =>
        [5, 11].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="currentColor" />),
      )}
    </svg>
  );
}

export function ChevronIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function NoteIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <line x1="5.5" y1="6" x2="10.5" y2="6" stroke="currentColor" strokeWidth="1.2" />
      <line x1="5.5" y1="9" x2="10.5" y2="9" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
