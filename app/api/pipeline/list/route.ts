import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const url = new URL(req.url);
  const owner = url.searchParams.get("owner");

  // Get current workspace
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Get deals for this workspace with related data
  let query = supabase
    .from("deals")
    .select(`
      *,
      leads:lead_id(
        id,
        first_name,
        last_name,
        email,
        company
      ),
      owner:owner_id(
        id,
        email,
        full_name
      )
    `)
    .eq("workspace_id", workspaceId);

  // Apply owner filter
  if (owner) {
    if (owner === "unassigned") {
      query = query.is("owner_id", null);
    } else {
      query = query.eq("owner_id", owner);
    }
  }

  const { data: deals, error: dealsError } = await query.order("updated_at", { ascending: false });

  if (dealsError) {
    return NextResponse.json({ error: dealsError.message }, { status: 400 });
  }

  return NextResponse.json({ deals: deals || [] });
}


