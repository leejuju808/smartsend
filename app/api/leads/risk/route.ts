import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = createClient();

  // Check authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .single();

  let workspaceId: string | null = null;

  if (membership) {
    workspaceId = membership.workspace_id;
  } else {
    // Fallback: get first workspace if no default
    const { data: fallbackMembership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (fallbackMembership) {
      workspaceId = fallbackMembership.workspace_id;
    }
  }

  // Build query - get leads with risk, optionally filtered by workspace
  let query = supabase
    .from("leads")
    .select("id, name, email, city, risk_level, risk_reason, last_activity_at, pipeline_stage")
    .neq("risk_level", "none")
    .order("risk_level", { ascending: false })
    .order("risk_updated_at", { ascending: false });

  // Filter by workspace if available
  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching risk leads:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data || []);
}










































