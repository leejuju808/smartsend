import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { workspaceId } = await req.json();
  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  const supabase = createClient();
  const { data: seq, error } = await supabase
    .from("sequences")
    .insert({ workspace_id: workspaceId, name: "Quick Intro" })
    .select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const steps = [
    { sequence_id: seq.id, step_order: 1, subject_template: "Quick chat, {{first_name}}?", body_text_template: "Hey {{first_name}},\nI had an idea to boost meetings from replies at {{company}}.\nWorth 15 min?\n\n– Julian", delay_minutes: 0 },
    { sequence_id: seq.id, step_order: 2, subject_template: "Re: {{company}}", body_text_template: "Bumping this in case helpful.\nMany teams lift MB/100 by 20–40% with small tweaks.\n– Julian", delay_minutes: 1440 }
  ];
  const { error: sErr } = await supabase.from("sequence_steps").insert(steps);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, sequenceId: seq.id });
}