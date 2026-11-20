/** A one-event .ics calendar file, for "Adicionar ao calendário". */
export function icsEvent(opts: { title: string; start: Date; end: Date; location?: string; description?: string }): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const esc = (s: string) => s.replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CorteCerto//PT', 'BEGIN:VEVENT',
    `UID:${fmt(opts.start)}-${Math.random().toString(36).slice(2)}@cortecerto`,
    `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(opts.start)}`, `DTEND:${fmt(opts.end)}`,
    `SUMMARY:${esc(opts.title)}`,
    ...(opts.location ? [`LOCATION:${esc(opts.location)}`] : []),
    ...(opts.description ? [`DESCRIPTION:${esc(opts.description)}`] : []),
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Lembrete', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}

export function downloadIcs(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
