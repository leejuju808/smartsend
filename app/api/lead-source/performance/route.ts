import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/lead-source/performance
 * Fetch comprehensive lead source performance data including grades, recommendations, and routing rules
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const workspace_id = searchParams.get("workspace_id");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!workspace_id) {
      return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
    }

    // Verify user has access to this workspace
    const { data: membership, error: memberError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (memberError || !membership) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Fetch lead source stats with grades
    const { data: stats, error: statsError } = await supabase
      .from("lead_source_stats")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("revenue_won", { ascending: false, nullsLast: true });

    if (statsError) {
      console.error("Error fetching lead source stats:", statsError);
      return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }

    // Fetch recommendations
    const { data: recommendations, error: recError } = await supabase
      .from("lead_source_recommendations")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("status", "active")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (recError) {
      console.error("Error fetching recommendations:", recError);
    }

    // Fetch routing rules
    const { data: routingRules, error: routingError } = await supabase
      .from("lead_source_routing_rules")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("is_active", true);

    if (routingError) {
      console.error("Error fetching routing rules:", routingError);
    }

    // Group recommendations by source
    const recommendationsBySource = new Map<string, any[]>();
    (recommendations || []).forEach((rec) => {
      if (!recommendationsBySource.has(rec.source_name)) {
        recommendationsBySource.set(rec.source_name, []);
      }
      recommendationsBySource.get(rec.source_name)!.push(rec);
    });

    // Enrich stats with recommendations
    const enrichedStats = (stats || []).map((stat) => ({
      ...stat,
      recommendations: recommendationsBySource.get(stat.source_name) || [],
      routingRule: (routingRules || []).find((r) => r.source_name === stat.source_name),
    }));

    return NextResponse.json({
      stats: enrichedStats,
      recommendations: recommendations || [],
      routingRules: routingRules || [],
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/lead-source/performance/grade
 * Trigger grading calculation for lead sources
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const body = await request.json();
    const workspace_id = body.workspace_id;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Call edge function to grade sources
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/lead-source-grade`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ workspace_id }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: "Failed to grade sources", details: error }, { status: 500 });
    }

    const result = await response.json();

    return NextResponse.json(result);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}









































