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

  // Get deals from the priority view
  const { data: deals, error: dealsError } = await supabase
    .from("roofing_deal_priority")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("expected_profit", { ascending: false, nullsFirst: false });

  if (dealsError) {
    return NextResponse.json({ error: dealsError.message }, { status: 400 });
  }

  return NextResponse.json({ deals: deals || [] });
}



































