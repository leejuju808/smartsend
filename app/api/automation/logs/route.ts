// Block 75000 — Automation Logs API
// GET /api/automation/logs - Get automation execution logs

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get user for auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const ruleId = searchParams.get("rule_id");
    const outcome = searchParams.get("outcome");
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build query
    let query = supabase
      .from("automation_logs")
      .select(`
        *,
        automation_rules:rule_id (
          id,
          name,
          trigger_type,
          action_type
        )
      `)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (ruleId) {
      query = query.eq("rule_id", ruleId);
    }

    if (outcome) {
      query = query.eq("outcome", outcome);
    }

    const { data: logs, error: logsError } = await query;

    if (logsError) {
      console.error("[Automation Logs] Fetch error:", logsError);
      return NextResponse.json(
        { error: "Failed to fetch automation logs" },
        { status: 500 }
      );
    }

    // Get total count for pagination
    let countQuery = supabase
      .from("automation_logs")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);

    if (ruleId) {
      countQuery = countQuery.eq("rule_id", ruleId);
    }

    if (outcome) {
      countQuery = countQuery.eq("outcome", outcome);
    }

    const { count } = await countQuery;

    return NextResponse.json({
      logs: logs || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("[Automation Logs] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























