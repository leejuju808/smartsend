import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const body = await req.json();
  const dealId = params.id;

  const { owner_id } = body;

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

  // Get deal to verify workspace and current owner
  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .select("id, workspace_id, owner_id")
    .eq("id", dealId)
    .single();

  if (dealError || !deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (deal.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Determine target owner_id (use provided or current user)
  const targetOwnerId = owner_id || user.id;

  // Check permissions
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Members can only claim unassigned deals or reassign their own deals
  // Owners/admins can assign to anyone
  if (membership.role === "member") {
    if (deal.owner_id && deal.owner_id !== user.id) {
      return NextResponse.json(
        { error: "You can only claim unassigned deals or reassign your own deals" },
        { status: 403 }
      );
    }
  }

  // Verify target owner is a workspace member
  if (targetOwnerId) {
    const { data: targetMember } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", targetOwnerId)
      .single();

    if (!targetMember) {
      return NextResponse.json(
        { error: "Target user is not a workspace member" },
        { status: 400 }
      );
    }
  }

  // Update deal
  const { data: updatedDeal, error: updateError } = await supabase
    .from("deals")
    .update({
      owner_id: targetOwnerId || null,
    })
    .eq("id", dealId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ deal: updatedDeal });
}








