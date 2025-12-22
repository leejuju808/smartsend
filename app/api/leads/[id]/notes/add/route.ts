import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createClient();
  const { id } = await params;
  const { body } = await req.json();

  if (!body || typeof body !== "string" || body.trim().length === 0) {
    return NextResponse.json({ error: "Body is required" }, { status: 400 });
  }

  // Get current user to set user_id
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("lead_notes")
    .insert({ lead_id: id, body: body.trim(), user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Add timeline event
  await supabase.from("lead_timeline_events").insert({
    lead_id: id,
    event_type: "note_added",
    metadata: { text: body.trim() }
  }).catch((err) => {
    console.error("Failed to log timeline event:", err);
  });

  return NextResponse.json({ note: data });
}










