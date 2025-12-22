import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  try {
    const workspace_id = gate.workspace_id;
    const supabase = getServerSupabase();

    // Get campaign metrics from the view
    const { data: metrics, error } = await supabase
      .from("campaign_metrics")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("last_activity_at", { ascending: false });

    if (error) {
      console.error("Error fetching campaign metrics:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ data: metrics || [] });
  } catch (e: any) {
    console.error("Campaign metrics error:", e);
    return NextResponse.json(
      { error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

