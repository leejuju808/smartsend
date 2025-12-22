// Block 8720 — Follow-Up Task Board API
// PATCH /api/tasks/[id] - Update task status

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/supabase/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  let body: { status?: "open" | "done" } = {};
  try {
    body = await req.json();
  } catch {}

  if (!body.status) {
    return NextResponse.json({ error: "status required" }, { status: 400 });
  }

  const updates: any = { status: body.status };
  if (body.status === "done") {
    updates.completed_at = new Date().toISOString();
  } else {
    updates.completed_at = null;
  }

  const { error } = await supabase
    .from("lead_tasks")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    console.error("Task update error:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
