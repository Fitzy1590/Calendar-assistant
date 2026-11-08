import type { SVGProps } from "react";
import type { Sky } from "../lib/weather";

/** Line icons drawn for this app: 1.6px strokes on a 24px grid, currentColor only. */
type P = SVGProps<SVGSVGElement> & { size?: number };
const S = ({ size = 18, children, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    {children}
  </svg>
);

export const IHome = (p: P) => <S {...p}><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" /></S>;
export const ICal = (p: P) => <S {...p}><rect x="3.5" y="5" width="17" height="15" rx="1.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></S>;
export const ITasks = (p: P) => <S {...p}><path d="m4 7 2 2 3-3M4 15l2 2 3-3M12 8h8M12 16h8" /></S>;
export const IPeople = (p: P) => <S {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M16 5.2a3 3 0 0 1 0 5.6M17.5 14c1.6.6 2.6 2.4 3 5" /></S>;
export const IBell = (p: P) => <S {...p}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5h4" /></S>;
export const INews = (p: P) => <S {...p}><path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M7.5 9h6M7.5 12.5h6M7.5 16h4" /></S>;
export const ISport = (p: P) => <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17M3.5 12h17M6 6c3 2 3 10 0 12M18 6c-3 2-3 10 0 12" /></S>;
export const ICog = (p: P) => <S {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></S>;
export const IMic = (p: P) => <S {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></S>;
export const ISend = (p: P) => <S {...p}><path d="M4 12h14M13 6l6 6-6 6" /></S>;
export const IChat = (p: P) => <S {...p}><path d="M4 5h16v11H9l-5 4z" /></S>;
export const IPlus = (p: P) => <S {...p}><path d="M12 5v14M5 12h14" /></S>;
export const IX = (p: P) => <S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>;
export const ILeft = (p: P) => <S {...p}><path d="m14.5 6-6 6 6 6" /></S>;
export const IRight = (p: P) => <S {...p}><path d="m9.5 6 6 6-6 6" /></S>;
export const IDown = (p: P) => <S {...p}><path d="m6 9.5 6 6 6-6" /></S>;
export const IPhone = (p: P) => <S {...p}><path d="M5 4h4l1.5 4-2.2 1.4a11 11 0 0 0 6.3 6.3L16 13.5l4 1.5v4a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z" /></S>;
export const ISms = (p: P) => <S {...p}><path d="M4 5h16v11H9l-5 4zM8 10h.01M12 10h.01M16 10h.01" /></S>;
export const ISliders = (p: P) => <S {...p}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></S>;
export const IMail = (p: P) => <S {...p}><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" /><path d="m4 7 8 6 8-6" /></S>;
export const ISearch = (p: P) => <S {...p}><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></S>;
export const ICheck = (p: P) => <S {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></S>;
export const IIdea = (p: P) => <S {...p}><path d="M9 17h6M10 20.5h4M12 3.5a6 6 0 0 0-3.5 10.9V17h7v-2.6A6 6 0 0 0 12 3.5z" /></S>;
export const ISync = (p: P) => <S {...p}><path d="M19.5 9A7.5 7.5 0 0 0 5.6 7.5M4.5 15a7.5 7.5 0 0 0 13.9 1.5M19.5 4v5h-5M4.5 20v-5h5" /></S>;
export const IPin = (p: P) => <S {...p}><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></S>;
export const IExternal = (p: P) => <S {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></S>;
export const IPlay = (p: P) => <S {...p}><path d="M8 5.5v13l10.5-6.5z" /></S>;
export const ICake = (p: P) => <S {...p}><path d="M4 20h16v-7H4zM4 16c2 1.5 4 1.5 5.3 0 1.4 1.5 4 1.5 5.4 0 1.3 1.5 3.3 1.5 5.3 0M12 13V9M12 6.5c-.9-.8-.9-1.9 0-3 .9 1.1.9 2.2 0 3z" /></S>;
export const ITrash = (p: P) => <S {...p}><path d="M5 7h14M10 7V4.5h4V7M6.5 7l1 13h9l1-13" /></S>;
export const IStar = ({ filled, ...p }: P & { filled?: boolean }) => <S {...p}><path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" fill={filled ? "currentColor" : "none"} /></S>;

export function WeatherIcon({ sky, size = 22, night }: { sky: Sky; size?: number; night?: boolean }) {
  const sun = night ? <path d="M15 4.5a6.5 6.5 0 1 0 4.5 9.8A5.5 5.5 0 0 1 15 4.5z" /> : (
    <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>
  );
  const cloud = (y = 0) => <path transform={`translate(0 ${y})`} d="M7 18h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 18z" />;
  switch (sky) {
    case "clear": return <S size={size}>{sun}</S>;
    case "partly": return <S size={size}><g transform="translate(-3 -4) scale(.75)">{sun}</g><path d="M9 20h8a3.5 3.5 0 0 0 .3-7 4.8 4.8 0 0 0-9.2 1.4A2.8 2.8 0 0 0 9 20z" /></S>;
    case "cloudy": return <S size={size}>{cloud(-1)}</S>;
    case "fog": return <S size={size}>{cloud(-4)}<path d="M5 18h14M7 21h10" /></S>;
    case "drizzle": return <S size={size}>{cloud(-4)}<path d="M9 18v1M13 18v1M17 18v1M11 21v.5M15 21v.5" /></S>;
    case "rain": return <S size={size}>{cloud(-4)}<path d="m9 17-1 3M13 17l-1 3M17 17l-1 3" /></S>;
    case "snow": return <S size={size}>{cloud(-4)}<path d="M9 18.5h.01M13 18.5h.01M17 18.5h.01M11 21h.01M15 21h.01" strokeWidth={2.4} /></S>;
    case "storm": return <S size={size}>{cloud(-4)}<path d="m13 15-2.5 4h3L11 23" /></S>;
  }
}
export const INote = (p: P) => <S {...p}><path d="M5 4h14v10l-6 6H5z" /><path d="M13 20v-6h6M8.5 8.5h7M8.5 12h4" /></S>;
export const IPinNote = ({ filled, ...p }: P & { filled?: boolean }) => <S {...p}><path d="M9 4h6l-1 5 3 3v1H7v-1l3-3zM12 13v7" fill={filled ? "currentColor" : "none"} /></S>;
export const IArchive = (p: P) => <S {...p}><rect x="3.5" y="4.5" width="17" height="4" rx="1" /><path d="M5 8.5v10h14v-10M10 12.5h4" /></S>;
export const IPalette = (p: P) => <S {...p}><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.6-1 1-1.9-.7-1 .1-2.1 1.2-2.1H17a3.5 3.5 0 0 0 3.5-3.5c0-5.3-3.8-9.5-8.5-9.5z" /><circle cx="8" cy="11" r="1" /><circle cx="11" cy="7.5" r="1" /><circle cx="15.5" cy="8.5" r="1" /></S>;
export const ICart = (p: P) => <S {...p}><path d="M3.5 4.5h2.2l2.1 10.2h10.4l1.8-7.2H7" /><circle cx="9.5" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></S>;
export const INavigate = (p: P) => <S {...p}><path d="M20 4 4 11l7 2 2 7z" /></S>;
export const ITrend = ({ down, ...p }: P & { down?: boolean }) => <S {...p}>{down ? <path d="m4 7 6 6 4-4 6 6M20 10v5h-5" /> : <path d="m4 17 6-6 4 4 6-6M20 14V9h-5" />}</S>;
