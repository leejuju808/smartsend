// Minimal, dependency-free ICS generator
export type IcsInput = {
  title: string;
  description?: string;
  start: Date;          // UTC
  durationMin: number;
  organizerEmail: string;
  organizerName?: string;
  location?: string;    // e.g., "Google Meet" or Calendly placeholder
};

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const fmt = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

export function buildICS({
  title,
  description = "",
  start,
  durationMin,
  organizerEmail,
  organizerName = "SmartSend",
  location = "Video conference",
}: IcsInput) {
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  const uid = `${start.getTime()}@smartsend`;
  const now = new Date();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SmartSend//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${fmt(now)}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${escapeICS(title)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    `LOCATION:${escapeICS(location)}`,
    `ORGANIZER;CN=${escapeICS(organizerName)}:mailto:${organizerEmail}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

function escapeICS(s: string) {
  return s.replace(/\\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
} 