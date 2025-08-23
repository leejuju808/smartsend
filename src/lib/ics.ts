import crypto from "crypto";

function fmt(dt: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    dt.getUTCFullYear().toString() +
    pad(dt.getUTCMonth() + 1) +
    pad(dt.getUTCDate()) + "T" +
    pad(dt.getUTCHours()) +
    pad(dt.getUTCMinutes()) +
    pad(dt.getUTCSeconds()) + "Z"
  );
}

function escapeText(s: string) {
  return s.replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
}

function escapeParam(s: string) {
  return s.replace(/([,;])/g, "\\$1");
}

export function makeIcs({
  start,
  durationMin,
  title,
  description,
  organizerName,
  organizerEmail,
  attendeeEmail,
}: {
  start: Date;
  durationMin: number;
  title: string;
  description?: string;
  organizerName: string;
  organizerEmail: string;
  attendeeEmail?: string;
}) {
  const dtStart = new Date(start.toISOString());
  const dtEnd = new Date(dtStart.getTime() + durationMin * 60_000);
  const uid = crypto.randomUUID();
  const now = new Date();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SmartSend//Meeting//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${fmt(now)}`,
    `DTSTART:${fmt(dtStart)}`,
    `DTEND:${fmt(dtEnd)}`,
    `SUMMARY:${escapeText(title)}`,
    description ? `DESCRIPTION:${escapeText(description)}` : "",
    `ORGANIZER;CN=${escapeParam(organizerName)}:mailto:${organizerEmail}`,
    attendeeEmail
      ? `ATTENDEE;CN=${escapeParam(attendeeEmail)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendeeEmail}`
      : "",
    "STATUS:TENTATIVE",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].filter(Boolean);

  return lines.join("\r\n");
}

export function buildSimpleICS(opts: {
  title: string; description?: string; url?: string;
  start: Date; end: Date; organizer: string;
}): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const dt = (d: Date) =>
    d.getUTCFullYear()
    + pad(d.getUTCMonth()+1)
    + pad(d.getUTCDate())
    + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + "00Z";
  const uid = `smartsend-${Date.now()}@yourdomain.com`;
  return [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//SmartSendAI//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dt(new Date())}`,
    `DTSTART:${dt(opts.start)}`,
    `DTEND:${dt(opts.end)}`,
    `SUMMARY:${opts.title}`,
    opts.description ? `DESCRIPTION:${opts.description}` : "",
    opts.url ? `URL:${opts.url}` : "",
    `ORGANIZER:${opts.organizer}`,
    "END:VEVENT","END:VCALENDAR",""
  ].join("\r\n");
}

