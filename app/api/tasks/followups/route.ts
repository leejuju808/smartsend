// Block 8720 — Follow-Up Task Board API
// GET /api/tasks/followups - List open follow-up tasks

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/supabase/types";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("lead_tasks")
    .select(
      `
      id,
      lead_id,
      title,
      status,
      due_at,
      created_at,
      leads:lead_id (
        id,
        email,
        first_name,
        last_name,
        name,
        outcome
      )
    `
    )
    .eq("owner_id", user.id)
    .eq("status", "open")
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Follow-ups load error:", error);
    return NextResponse.json(
      { error: "Failed to load follow-ups" },
      { status: 500 }
    );
  }

  return NextResponse.json({ tasks: data ?? [] }, { status: 200 });
}

























































