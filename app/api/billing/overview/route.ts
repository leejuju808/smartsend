import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId } = await req.json();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId required" },
        { status: 400 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      // Try team_members as fallback
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("workspace_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (!teamMember) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Fetch all data in parallel
    const [{ data: workspace, error: workspaceError }, { data: metrics, error: metricsError }, { data: guard, error: guardError }] =
      await Promise.all([
        supabase
          .from("workspaces")
          .select("plan, seat_limit, daily_send_cap, daily_reply_cap")
          .eq("id", workspaceId)
          .single(),

        supabase
          .from("billing_metrics")
          .select("*")
          .eq("workspace_id", workspaceId)
          .maybeSingle(),

        supabase
          .from("billing_global_guard")
          .select("*")
          .eq("workspace_id", workspaceId)
          .single(),
      ]);

    if (workspaceError) {
      return NextResponse.json(
        { error: workspaceError.message },
        { status: 400 }
      );
    }

    // Get credits
    const { data: credits, error: creditsError } = await supabase
      .from("workspace_credits")
      .select("credits")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    return NextResponse.json({
      workspace: workspace || {},
      metrics: metrics || {},
      guard: guard || {},
      credits: credits?.credits ?? 0,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}








