/** Human-readable sizes, times and links for the page. */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
}

export function formatLongDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(new Date(timestamp));
}

export function formatShortDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(timestamp));
}

function formatClockTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(timestamp));
}

/** "today 12:24", "tomorrow 09:10", or a short date with the time. */
export function formatDayAndTime(timestamp: number): string {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayOffset = Math.floor((timestamp - startOfToday.getTime()) / 86_400_000);
  if (dayOffset === 0) return `today ${formatClockTime(timestamp)}`;
  if (dayOffset === 1) return `tomorrow ${formatClockTime(timestamp)}`;
  return formatLongDate(timestamp);
}

/** Compact remaining time for badges: "23 h", "41 min", "40 s", "expired". */
export function formatRemainingShort(expiresAt: number): string {
  const seconds = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
  if (seconds === 0) return "expired";
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)} h`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)} min`;
  return `${seconds} s`;
}

/** Shows a link without its scheme and with a long file name shortened in the middle. */
export function formatLinkForDisplay(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, "");
  const lastSlash = withoutScheme.lastIndexOf("/");
  const fileName = withoutScheme.slice(lastSlash + 1);
  if (fileName.length <= 20) return withoutScheme;
  const dot = fileName.lastIndexOf(".");
  const extension = dot > 0 ? fileName.slice(dot) : "";
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  return `${withoutScheme.slice(0, lastSlash + 1)}${stem.slice(0, 8)}…${stem.slice(-2)}${extension}`;
}
