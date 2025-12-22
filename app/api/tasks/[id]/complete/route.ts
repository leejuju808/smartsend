// app/api/tasks/[id]/complete/route.ts
// Block 21428 — SmartSend Task Complete API + Today View Wiring v1
// POST /api/tasks/[id]/complete - Mark a task as completed

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const taskId = params.id;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      status: "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("user_id", user.id);

  if (error) {
    console.error("Task complete error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 400 });
  }

  return NextResponse.json({ status: "ok" });
}

