import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * GET /api/deals/[id]/coach
 * Get AI Deal Coach insights for a specific deal
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id } = await params;

  // Get current workspace
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Verify deal belongs to workspace
  const { data: deal } = await supabase
    .from("deals")
    .select("workspace_id")
    .eq("id", id)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (deal.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get insights
  const { data: insights, error: insightsError } = await supabase
    .from("deal_coach_insights")
    .select("*")
    .eq("deal_id", id)
    .single();

  if (insightsError && insightsError.code !== "PGRST116") {
    // PGRST116 is "not found" which is OK
    return NextResponse.json(
      { error: insightsError.message },
      { status: 400 }
    );
  }

  // If no insights exist, trigger analysis
  if (!insights) {
    // Trigger async analysis (fire and forget)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceRoleKey) {
      fetch(`${supabaseUrl}/functions/v1/ai-deal-coach`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          deal_id: id,
          trigger: "deal_page_view",
        }),
      }).catch((err) => {
        console.error("Error triggering deal coach analysis:", err);
      });
    }

    return NextResponse.json({
      insights: null,
      analyzing: true,
      message: "Analysis in progress. Please refresh in a moment.",
    });
  }

  // Get activity log
  const { data: activities } = await supabase
    .from("deal_coach_activity")
    .select("*")
    .eq("deal_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    insights,
    activities: activities || [],
  });
}

/**
 * POST /api/deals/[id]/coach
 * Trigger manual analysis of a deal
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id } = await params;

  // Get current workspace
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Verify deal belongs to workspace
  const { data: deal } = await supabase
    .from("deals")
    .select("workspace_id")
    .eq("id", id)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (deal.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Trigger analysis via edge function
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ai-deal-coach`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        deal_id: id,
        trigger: "manual",
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: result.error || "Analysis failed" },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ok: true,
      insights: result.insights,
      message: "Deal analyzed successfully",
    });
  } catch (error: any) {
    console.error("Error triggering deal coach:", error);
    return NextResponse.json(
      { error: error.message || "Failed to trigger analysis" },
      { status: 500 }
    );
  }
}



