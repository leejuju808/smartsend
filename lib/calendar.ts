export function buildICS({
  uid,
  title,
  description,
  start,
  end,
  organizer,
  attendee,
  location,
}: {
  uid: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  organizer: { name: string; email: string };
  attendee: { name?: string; email: string };
  location?: string;
}) {
  function fmt(d: Date) {
    const s = d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    return s;
  }
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SmartSend//Meeting//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${fmt(new Date())}
DTSTART:${fmt(start)}
DTEND:${fmt(end)}
SUMMARY:${escapeICS(title)}
DESCRIPTION:${escapeICS(description || "")}
ORGANIZER;CN=${escapeICS(organizer.name)}:mailto:${organizer.email}
ATTENDEE;CN=${escapeICS(attendee.name || "")};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee.email}
LOCATION:${escapeICS(location || "")}
END:VEVENT
END:VCALENDAR`;
  return ics;
}

function escapeICS(s: string) {
  return s.replace(/[\n,;]/g, (m) => ({ "\n": "\\n", ",": "\\,", ";": "\\;" }[m] as string));
}

export function googleLink({
  title,
  start,
  end,
  details,
  location,
}: {
  title: string;
  start: Date;
  end: Date;
  details?: string;
  location?: string;
}) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: details || "",
    location: location || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookLink({
  title,
  start,
  end,
  body,
  location,
}: {
  title: string;
  start: Date;
  end: Date;
  body?: string;
  location?: string;
}) {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: body || "",
    location: location || "",
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}



