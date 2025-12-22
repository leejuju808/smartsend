import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("meeting_pipeline_view")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return new Response("Not found", { status: 404 });
  }

  if (!data.start_time) {
    return new Response("Meeting has no start time", { status: 400 });
  }

  const start = new Date(data.start_time);
  const end = data.end_time ? new Date(data.end_time) : new Date(start.getTime() + 30 * 60 * 1000);

  const format = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SmartSend//Meeting//EN",
    "BEGIN:VEVENT",
    `UID:${data.id}@smartsend`,
    `DTSTAMP:${format(new Date())}`,
    `DTSTART:${format(start)}`,
    `DTEND:${format(end)}`,
    `SUMMARY:${data.title || `Call with ${data.first_name || ""} ${data.last_name || ""}`}`,
    data.location ? `LOCATION:${data.location}` : "",
    data.link ? `URL:${data.link}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="meeting-${data.id}.ics"`,
    },
  });
}

