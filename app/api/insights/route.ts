import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET() {
  const supabase = createClient();

  // Get current workspace
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Get latest insights from cache
  const { data, error } = await supabase
    .from("insights_cache")
    .select("data")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 is "not found" which is OK
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data?.data || {});
}









