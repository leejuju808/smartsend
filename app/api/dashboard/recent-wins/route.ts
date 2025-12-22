// app/api/dashboard/recent-wins/route.ts
// Block 8870 — Revenue & Activity Dashboard v1
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get user's workspace membership
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (memberError || !membership) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }

  const workspaceId = membership.workspace_id;

  const { data, error } = await supabase
    .from("leads")
    .select("id, name, first_name, last_name, email, city, actual_value, closed_at")
    .eq("workspace_id", workspaceId)
    .eq("pipeline_stage", "won")
    .order("closed_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Recent wins error:", error);
    return NextResponse.json(
      { error: "Failed to load recent wins" },
      { status: 500 }
    );
  }

  // Transform data to ensure name is available
  const transformedData = (data ?? []).map((lead: any) => ({
    ...lead,
    name: lead.name || (lead.first_name || lead.last_name 
      ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim() 
      : lead.email),
  }));

  return NextResponse.json(transformedData, { status: 200 });
}

