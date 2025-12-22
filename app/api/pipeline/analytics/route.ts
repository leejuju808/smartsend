import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  // Get current workspace
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Get the latest analytics snapshot
  const { data: analytics, error: analyticsError } = await supabase
    .from("deal_analytics")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  if (analyticsError) {
    // If no snapshot exists yet, return empty data structure
    if (analyticsError.code === "PGRST116") {
      return NextResponse.json({
        analytics: null,
        generated_at: null,
        message: "No analytics data available yet. Analytics are generated hourly.",
      });
    }
    return NextResponse.json({ error: analyticsError.message }, { status: 400 });
  }

  return NextResponse.json({
    analytics: analytics.data,
    generated_at: analytics.generated_at,
  });
}








