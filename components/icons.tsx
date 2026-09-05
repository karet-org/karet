// Icon library, Karet logo + simple UI icons (no emojis).

interface IconProps { className?: string; size?: number }

function Svg({ children, className, size = 16, viewBox = "0 0 24 24" }: IconProps & { children: React.ReactNode; viewBox?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

/** Karet official logo mark. */
export function KaretLogo({ className, size = 22 }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 64 64" className={className} aria-label="Karet">
      <g stroke-linejoin="round" stroke-width="3">
      <path fill="#c1803c" stroke="#c1803c" d="M 16.83,19.66 18.85,28.60 44.61,28.77 46.55,19.68 Z"/>
      <path fill="#bababa" stroke="#bababa" d="M 19.83,33.13 21.76,41.74 41.39,41.86 43.53,33.17 Z"/>
      <path fill="#c9a53e" stroke="#c9a53e" d="M 23.14,46.21 30.34,61.48 32.50,61.49 39.89,46.20 Z"/>
      </g>
      <g stroke-linejoin="round" stroke-width="2" transform="translate(0,-1)">
      <path fill="#156d3e" stroke="#156d3e" d="M 30.061768,17.52193 30.158341,2.7306215 33.785621,0.92491163 33.676422,17.650068 Z"/>
      <path fill="#156d3e" stroke="#156d3e" transform="translate(-1.5,0)" d="m 28.837065,15.005055 -4.903898,-1.025117 -3.16386,-3.052221 -0.615448,-4.91724 4.7427,0.9195276 3.216456,3.2616364 z"/>
      <path fill="#156d3e" stroke="#156d3e" transform="translate(1.5,0)" d="m 34.938663,14.417672 0.08979,-5.48759 4.018307,-3.8416215 5.239604,-0.8020841 -0.627686,5.222738 -3.802131,3.7907606 z"/>
      </g>
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
export const IconMenu = (p: IconProps) => <Svg {...p}><path d="M3 6h18M3 12h18M3 18h18" /></Svg>;
export const IconClose = (p: IconProps) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
export const IconExternal = (p: IconProps) => <Svg {...p}><path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></Svg>;
export const IconDownload = (p: IconProps) => <Svg {...p}><path d="M12 3v12m-5-5 5 5 5-5M5 21h14" /></Svg>;
export const IconUpload = (p: IconProps) => <Svg {...p}><path d="M12 21V9m-5 5 5-5 5 5M5 3h14" /></Svg>;
export const IconPlus = (p: IconProps) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconSettings = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Svg>;
