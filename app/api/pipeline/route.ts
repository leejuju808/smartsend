import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const stage = url.searchParams.get("stage");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
  }

  if (stage) {
    // Fetch leads inside one column
    const { data, error } = await supabase
      .from("leads")
      .select("id, name, first_name, last_name, email, city, heat_score, last_activity_at, created_at, is_hot, hot_reason, hot_score")
      .eq("pipeline_stage", stage)
      .eq("workspace_id", workspaceId)
      .order("last_activity_at", { ascending: false });

    if (error) {
      console.error("Pipeline load error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Construct name field from first_name/last_name if name doesn't exist
    const leadsWithName = (data || []).map((lead: any) => ({
      ...lead,
      name: lead.name || 
            (lead.first_name && lead.last_name ? `${lead.first_name} ${lead.last_name}`.trim() : null) ||
            lead.first_name ||
            lead.last_name ||
            null,
    }));

    return NextResponse.json(leadsWithName);
  }

  // Summary counts for board render
  const { data, error } = await supabase.rpc("get_pipeline_summary", {
    p_workspace_id: workspaceId,
  });

  if (error) {
    console.error("Pipeline summary error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
