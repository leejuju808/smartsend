export type IcsEvent = {
  uid: string
  title: string
  description?: string
  start: Date
  end: Date
  organizerEmail: string
  organizerName?: string
  attendeeEmail: string
  location?: string
}

function fmt(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) + 'Z'
  )
}

export function buildICS(e: IcsEvent) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SmartSendAI//AutoMeeting//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(e.start)}`,
    `DTEND:${fmt(e.end)}`,
    `SUMMARY:${escapeText(e.title)}`,
    e.description ? `DESCRIPTION:${escapeText(e.description)}` : '',
    e.location ? `LOCATION:${escapeText(e.location)}` : '',
    `ORGANIZER;CN=${escapeText(e.organizerName || 'SmartSend User')}:MAILTO:${e.organizerEmail}`,
    `ATTENDEE;CN=${escapeText(e.attendeeEmail)};RSVP=TRUE:MAILTO:${e.attendeeEmail}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean)
  return lines.join('\r\n')
}

function escapeText(t: string) {
  return t
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}
