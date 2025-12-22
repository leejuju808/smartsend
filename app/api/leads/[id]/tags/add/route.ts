import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { tag_id } = await req.json();

  const { data, error } = await supabase
    .from("lead_tag_links")
    .insert({ lead_id: params.id, tag_id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // timeline event
  await supabase.from("lead_timeline_events").insert({
    lead_id: params.id,
    event_type: "tag_added",
    metadata: { tag_id }
  });

  return NextResponse.json({ link: data });
}










