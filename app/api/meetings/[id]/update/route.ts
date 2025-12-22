import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const body = await req.json();
  const { status, meetingUrl, startTime, endTime, title, notes } = body;

  const patch: any = {};
  if (status) patch.status = status;
  if (meetingUrl !== undefined) patch.meeting_url = meetingUrl;
  if (startTime !== undefined) patch.start_time = startTime;
  if (endTime !== undefined) patch.end_time = endTime;
  if (title !== undefined) patch.title = title;
  if (notes !== undefined) patch.notes = notes;

  const { error } = await supabase
    .from("lead_meetings")
    .update(patch)
    .eq("id", params.id);

  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  return Response.json({ ok: true }, { status: 200 });
}

