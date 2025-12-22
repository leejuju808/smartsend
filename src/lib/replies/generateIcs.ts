function pad(n: number) { return String(n).padStart(2, '0'); }

// Create a single placeholder ICS event for tomorrow 10:00 local time converted to UTC.
export function makeIcs({
  title = 'Intro Call',
  description = 'Quick intro call',
  durationMin = 30,
  timezone = 'America/Los_Angeles',
}: {
  title?: string; 
  description?: string; 
  durationMin?: number; 
  timezone?: string;
}) {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24*60*60*1000);

  // Target local time 10:00 in provided timezone; convert to UTC using Intl API
  // 17:00Z ~= 10:00 PT during DST; this is a pragmatic placeholder without heavy tz deps.
  const targetLocal = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 17, 0, 0));

  const dtStart = targetLocal; // already UTC
  const dtEnd = new Date(dtStart.getTime() + durationMin * 60000);

  const fmt = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

  const uid = `${Date.now()}@smartsend`; // rough UID

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SmartSend//Auto Reply//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(dtStart)}`,
    `DTEND:${fmt(dtEnd)}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  return { filename: 'intro-call.ics', content: ics };
}

function escapeIcs(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
} 