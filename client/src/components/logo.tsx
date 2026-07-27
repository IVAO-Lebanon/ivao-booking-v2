// BYBLOS brand mark - the tiered Lebanese cedar (Final 2A from the design project).
// Uses `currentColor` so the caller sets the colour via a text-* class:
//   green on light (#007A3D), brighter green on dark (#1FCE7A), or white on the
//   brand-blue icon/favicon.

export function CedarMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" className={className} aria-hidden="true">
      <rect x="46" y="80" width="8" height="12" rx="2" />
      <path d="M16 78 L84 78 L50 56 Z" />
      <path d="M24 58 L76 58 L50 36 Z" />
      <path d="M32 40 L68 40 L50 16 Z" />
    </svg>
  );
}
