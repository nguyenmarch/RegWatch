const GMT7_TIME_ZONE = 'Asia/Ho_Chi_Minh'

export function parseBackendDate(value: string): Date {
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  return new Date(hasTimeZone ? value : `${value}Z`)
}

export function formatGmt7Time(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: GMT7_TIME_ZONE,
  })
}

export function formatGmt7DateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: GMT7_TIME_ZONE,
  }).format(parseBackendDate(value))
}
