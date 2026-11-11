// Time and value formatting for the Search page. Times are epoch seconds and
// are shown in the browser's time zone.

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function dayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** `Nov 6 22:58:00.741` */
export function formatEventTime(seconds: number): string {
  const d = new Date(seconds * 1000);
  return `${dayLabel(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** `Nov 6, 2026, 22:58` */
export function formatDateTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** A short label for a moment on the histogram axis, given the bar width. */
export function formatAxisTime(seconds: number, interval: number): string {
  const d = new Date(seconds * 1000);
  if (interval >= 86400) return dayLabel(d);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}${interval < 60 ? `:${pad(d.getSeconds())}` : ""}`;
  return `${dayLabel(d)} ${time}`;
}

/** `Nov 6 22:00 to 23:00`, with the date repeated only when it changes. */
export function formatSpan(from: number, to: number): string {
  const a = new Date(from * 1000);
  const b = new Date(to * 1000);
  const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = a.toDateString() === b.toDateString();
  return `${dayLabel(a)} ${hm(a)} to ${sameDay ? "" : `${dayLabel(b)} `}${hm(b)}`;
}

/** A cell value as text, or null for SQL NULL. */
export function valueText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
