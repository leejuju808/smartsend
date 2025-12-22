import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { task_id } = await req.json().catch(() => ({}));

  if (!task_id) {
    return NextResponse.json({ error: "task_id required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("followup_tasks")
    .update({ status: "canceled", reason: "user_skip" })
    .eq("id", task_id)
    .eq("status", "queued");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}




