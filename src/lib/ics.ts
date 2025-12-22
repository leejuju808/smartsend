import { randomUUID } from "crypto";

// Reply Intent ICS generation functions
function formatDateUTC(d: Date) {
  const iso = d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  return iso.replace(/\.\d{3}Z$/, "Z");
}

export function generateIcs({
  summary,
  description,
  start,
  end,
  url,
  uid,
  location = "Google Meet (via Calendly)",
  organizerEmail,
  attendeeEmail,
}: {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  url?: string;
  uid?: string;
  location?: string;
  organizerEmail?: string;
  attendeeEmail?: string;
}) {
  const now = new Date();
  const id = uid ?? randomUUID();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SmartSendAI//ReplyIntent//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${id}`,
    `DTSTAMP:${formatDateUTC(now)}`,
    `DTSTART:${formatDateUTC(start)}`,
    `DTEND:${formatDateUTC(end)}`,
    `SUMMARY:${escapeText(summary)}`,
    description ? `DESCRIPTION:${escapeText(description)}` : undefined,
    url ? `URL:${url}` : undefined,
    location ? `LOCATION:${escapeText(location)}` : undefined,
    organizerEmail ? `ORGANIZER:mailto:${organizerEmail}` : undefined,
    attendeeEmail ? `ATTENDEE;CN=Invitee:mailto:${attendeeEmail}` : undefined,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean) as string[];

  return lines.join("\r\n");
}

function escapeText(s: string) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

