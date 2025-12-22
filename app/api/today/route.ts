// app/api/today/route.ts
// Block 21428 — SmartSend Task Complete API + Today View Wiring v1
// GET /api/today - Get only today's pending tasks (Today Task Completion Engine UI)

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // today in YYYY-MM-DD (UTC for now; you can adjust to local later if needed)
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .eq("due_date", today)
    .eq("status", "pending")
    .order("priority", { ascending: false });

  if (error) {
    console.error("Today tasks error:", error);
    return NextResponse.json({ error: "Fetch failed" }, { status: 400 });
  }

  return NextResponse.json({ tasks: data ?? [] });
}

