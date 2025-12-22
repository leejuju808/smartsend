// Block 90000 — Production Calendar Crew Load Balance API
// GET /api/production-calendar/crew-load?workspace_id=uuid&from=YYYY-MM-DD&to=YYYY-MM-DD

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!workspace_id || !from || !to) {
      return NextResponse.json(
        { error: "workspace_id, from, and to are required" },
        { status: 400 }
      );
    }

    // Verify workspace membership
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get crew load balance
    const { data: loadBalance, error } = await supabase.rpc(
      "get_crew_load_balance",
      {
        p_workspace_id: workspace_id,
        p_start_date: from,
        p_end_date: to,
      }
    );

    if (error) throw error;

    return NextResponse.json({ load_balance: loadBalance || [] });
  } catch (error: any) {
    console.error("Error fetching crew load balance:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























