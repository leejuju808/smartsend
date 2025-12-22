import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "no workspace" }, { status: 401 });
  }

  // Check permissions - only owners/admins can merge
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Check if user is owner/admin
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!member || !["owner", "admin"].includes(member.role)) {
    // Check workspace_settings for override
    const { data: settings } = await supabase
      .from("workspace_settings")
      .select("settings")
      .eq("workspace_id", workspaceId)
      .single();

    const allowMembersToMerge =
      settings?.settings?.permissions?.member_can_merge_companies || false;

    if (!allowMembersToMerge) {
      return NextResponse.json(
        { error: "Only owners and admins can merge companies" },
        { status: 403 }
      );
    }
  }

  const {
    primary_company_id,
    merged_company_id,
    field_selections = {},
  } = await req.json();

  if (!primary_company_id || !merged_company_id) {
    return NextResponse.json(
      { error: "primary_company_id and merged_company_id are required" },
      { status: 400 }
    );
  }

  if (primary_company_id === merged_company_id) {
    return NextResponse.json(
      { error: "Cannot merge a company with itself" },
      { status: 400 }
    );
  }

  try {
    const { data: mergeEventId, error } = await supabase.rpc("merge_companies", {
      p_workspace_id: workspaceId,
      p_primary_company_id: primary_company_id,
      p_merged_company_id: merged_company_id,
      p_merged_by: user.id,
      p_field_selections: field_selections,
    });

    if (error) {
      console.error("Error merging companies:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      merge_event_id: mergeEventId,
      message: "Companies merged successfully",
    });
  } catch (error: any) {
    console.error("Error in merge execution:", error);
    return NextResponse.json(
      { error: error.message || "Failed to merge companies" },
      { status: 500 }
    );
  }
}








