import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("followup_tasks")
    .select("id, scheduled_at, nudge_no, status, reason")
    .eq("thread_id", params.id)
    .in("status", ["queued", "running"])
    .order("scheduled_at", { ascending: true })
    .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ task: data?.[0] ?? null });
}


