// Icon library — carrot logo + simple UI icons (no emojis).

interface IconProps { className?: string; size?: number }

function Svg({ children, className, size = 16, viewBox = "0 0 24 24" }: IconProps & { children: React.ReactNode; viewBox?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

/** Karet golden carrot logo (filled, colored). */
export function KaretLogo({ className, size = 24 }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 64 64" className={className} aria-label="Karet">
      <defs>
        <linearGradient id="kl-body" x1="32" y1="18" x2="32" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFD54F"/>
          <stop offset="50%" stopColor="#FFB300"/>
          <stop offset="100%" stopColor="#E65100"/>
        </linearGradient>
        <linearGradient id="kl-shine" x1="28" y1="20" x2="34" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF8E1" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#FFF8E1" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="kl-leaf" x1="32" y1="2" x2="32" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#81C784"/>
          <stop offset="100%" stopColor="#2E7D32"/>
        </linearGradient>
      </defs>
      <path d="M28 18 C26 19, 23 24, 22 30 Q21 44, 32 58 Q43 44, 42 30 C41 24, 38 19, 36 18 Z" fill="url(#kl-body)" />
      <path d="M29 22 C28 28, 27 36, 30 48 C31 36, 30 28, 30 22 Z" fill="url(#kl-shine)" />
      <path d="M25 30 Q32 29, 39 30" stroke="#E65100" strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.4" />
      <path d="M26 37 Q32 36, 38 37" stroke="#E65100" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.3" />
      <path d="M30 19 C26 14, 16 8, 8 3 C10 6, 18 12, 24 16 C18 10, 12 7, 8 6 C14 10, 24 16, 29 19 Z" fill="url(#kl-leaf)" />
      <path d="M29 19 C28 10, 29 4, 32 0 C35 4, 36 10, 35 19 Z" fill="url(#kl-leaf)" />
      <path d="M34 19 C38 14, 48 8, 56 3 C54 6, 46 12, 40 16 C46 10, 52 7, 56 6 C50 10, 40 16, 35 19 Z" fill="url(#kl-leaf)" />
    </svg>
  );
}

export const IconSource = (p: IconProps) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></Svg>;
export const IconLookup = (p: IconProps) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Svg>;
export const IconMapping = (p: IconProps) => <Svg {...p}><path d="M4 7h10l-3-3m3 3-3 3M20 17H10l3-3m-3 3 3 3" /></Svg>;
export const IconTable = (p: IconProps) => <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></Svg>;

export const IconTrash = (p: IconProps) => <Svg {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" /></Svg>;
export const IconPlay = (p: IconProps) => <Svg {...p}><polygon points="6 4 20 12 6 20" fill="currentColor" /></Svg>;
export const IconChevronDown = (p: IconProps) => <Svg {...p}><polyline points="6 9 12 15 18 9" /></Svg>;
export const IconExternal = (p: IconProps) => <Svg {...p}><path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></Svg>;
export const IconDownload = (p: IconProps) => <Svg {...p}><path d="M12 3v12m-5-5 5 5 5-5M5 21h14" /></Svg>;
export const IconPackage = (p: IconProps) => <Svg {...p}><path d="m7.5 4.27 9 5.15M21 8 12 13 3 8M12 22V13M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></Svg>;
