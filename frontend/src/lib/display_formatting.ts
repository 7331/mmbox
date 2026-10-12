// Human-readable sizes, times and links for the page.

export function formatByteCount(byteCount: number): string {
  if (byteCount < 1024) return `${byteCount} B`
  if (byteCount < 1024 * 1024) return `${Math.round(byteCount / 1024)} KB`
  const megabytes = byteCount / (1024 * 1024)
  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`
}

export function formatLongDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(new Date(timestamp))
}

export function formatShortDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(timestamp))
}

function formatClockTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(timestamp))
}

// "today 12:24", "tomorrow 09:10", or a long date with the time.
export function formatDayAndTime(timestamp: number): string {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const dayOffset = Math.floor((timestamp - startOfToday.getTime()) / 86_400_000)
  if (dayOffset === 0) return `today ${formatClockTime(timestamp)}`
  if (dayOffset === 1) return `tomorrow ${formatClockTime(timestamp)}`
  return formatLongDate(timestamp)
}

// Compact remaining time for badges: "6 d", "23 h", "41 min", "40 s", "expired".
export function formatRemainingTimeShort(expiresAt: number, currentTime: number): string {
  const remainingSeconds = Math.max(0, Math.round((expiresAt - currentTime) / 1000))
  if (remainingSeconds === 0) return "expired"
  if (remainingSeconds >= 2 * 86400) return `${Math.floor(remainingSeconds / 86400)} d`
  if (remainingSeconds >= 3600) return `${Math.floor(remainingSeconds / 3600)} h`
  if (remainingSeconds >= 60) return `${Math.floor(remainingSeconds / 60)} min`
  return `${remainingSeconds} s`
}
