/**
 * Date helpers — every timestamp on the admin web is operations-facing and the
 * team is in IST. The browser's `.toLocaleString()` renders in the visitor's
 * own timezone, so a teammate opening the dashboard from a flight in Singapore
 * (or a Vercel server-side render running in us-east-1) would see UTC or some
 * other zone. Pin everything to Asia/Kolkata here.
 */

const IST_TZ = "Asia/Kolkata";

const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true
});

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true
});

const timeShortFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: true
});

function toDate(input: Date | string | number): Date | null {
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

export function formatIST(input: Date | string | number): string {
  const d = toDate(input);
  if (!d) return "—";
  return `${dateTimeFmt.format(d)} IST`;
}

export function formatTimeIST(input: Date | string | number): string {
  const d = toDate(input);
  if (!d) return "—";
  return `${timeFmt.format(d)} IST`;
}

export function formatTimeShortIST(input: Date | string | number): string {
  const d = toDate(input);
  if (!d) return "—";
  return `${timeShortFmt.format(d)} IST`;
}

export function relativeIST(input: Date | string | number, now: number = Date.now()): string {
  const d = toDate(input);
  if (!d) return "—";
  const diff = Math.max(0, Math.floor((now - d.getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return formatIST(d);
}
