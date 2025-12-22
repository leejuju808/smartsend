import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const leadId = params.id;

  // Get current workspace
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get lead with ownership data and owner profile
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select(
      `
      id,
      owner_id,
      ownership_mode,
      ownership_history,
      last_handoff_at,
      handoff_count,
      owner_profile:profiles!leads_owner_id_fkey(
        id,
        full_name,
        email
      )
    `
    )
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json(lead);
}









































