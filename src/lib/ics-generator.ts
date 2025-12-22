function pad(n: number) { return String(n).padStart(2, '0'); }

function toUtcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export function buildIcs(opts: {
  uid?: string;
  summary: string;
  description?: string;
  startAt: Date;   // in local or UTC; we serialize as UTC
  endAt: Date;     // in local or UTC
  organizerEmail?: string;
  attendeeEmail?: string;
  location?: string;
  url?: string;
}): { filename: string; content: string; uid: string } {
  const uid = opts.uid ?? `ss-${crypto.randomUUID()}@smartsend.ai`;
  const dtStart = toUtcStamp(opts.startAt);
  const dtEnd = toUtcStamp(opts.endAt);
  const dtStamp = toUtcStamp(new Date());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SmartSendAI//ReplyIntent//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcs(opts.summary)}`,
    opts.description ? `DESCRIPTION:${escapeIcs(opts.description)}` : '',
    opts.location ? `LOCATION:${escapeIcs(opts.location)}` : '',
    opts.url ? `URL:${escapeIcs(opts.url)}` : '',
    opts.organizerEmail ? `ORGANIZER:mailto:${opts.organizerEmail}` : '',
    opts.attendeeEmail ? `ATTENDEE;CN=${opts.attendeeEmail};ROLE=REQ-PARTICIPANT:mailto:${opts.attendeeEmail}` : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean);

  const content = lines.map(fold75).join('\r\n') + '\r\n';
  return { filename: `invite-${uid}.ics`, content, uid };
}

function escapeIcs(s: string) {
  return s.replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
}

// Fold long lines per RFC5545 (75 octets-ish); simple UTF-8 safe approximation
function fold75(line: string) {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 73) {
    parts.push((i === 0 ? '' : ' ') + line.slice(i, i + 73));
  }
  return parts.join('\r\n');
} 