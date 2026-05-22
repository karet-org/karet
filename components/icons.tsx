// Icon library -- carrot logo + simple UI icons (no emojis).

interface IconProps { className?: string; size?: number }

function Svg({ children, className, size = 16, viewBox = "0 0 24 24" }: IconProps & { children: React.ReactNode; viewBox?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

/** Karet carrot mark -- slim, two-color, used at small sizes only. */
export function KaretLogo({ className, size = 22 }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" className={className} aria-label="Karet">
      <path d="M11 8 C10 8.5, 8.5 11, 8.5 13 Q8.5 19, 12 22 Q15.5 19, 15.5 13 C15.5 11, 14 8.5, 13 8 Z" fill="#ff6b35" />
      <path d="M12 8 C10.5 5, 7 3, 5 2 C5.7 3, 8 5, 10 6.5 C7.5 4.5, 5.5 3.5, 5 3.5 C7 5, 10 6.8, 11.5 8 Z" fill="#4caf50" />
      <path d="M11.5 8 C11 4.5, 11.5 2.5, 12 1 C12.5 2.5, 13 4.5, 12.5 8 Z" fill="#4caf50" />
      <path d="M12.5 8 C14.5 5, 18 3, 19 2 C18.3 3, 16 5, 14 6.5 C16.5 4.5, 18.5 3.5, 19 3.5 C17 5, 14 6.8, 12.5 8 Z" fill="#4caf50" />
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
export const IconUpload = (p: IconProps) => <Svg {...p}><path d="M12 21V9m-5 5 5-5 5 5M5 3h14" /></Svg>;
export const IconPlus = (p: IconProps) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconSettings = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Svg>;
