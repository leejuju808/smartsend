// Block 21738 — SmartSend Roofing Owner Daily Briefing v1
// API Route: /api/daily-briefing

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace membership
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (memberError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const workspaceId = membership.workspace_id;

  try {
    // Call the daily_briefing function
    const { data, error } = await supabase.rpc("daily_briefing", {
      p_workspace_id: workspaceId,
    });

    if (error) {
      console.error("Daily briefing error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Daily briefing API error:", error);
    return NextResponse.json(
      { error: "Failed to load daily briefing data" },
      { status: 500 }
    );
  }
}










































