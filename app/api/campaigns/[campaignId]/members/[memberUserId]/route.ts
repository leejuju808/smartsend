// app/api/campaigns/[campaignId]/members/[memberUserId]/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function DELETE(
  _req: Request,
  { params }: { params: { campaignId: string; memberUserId: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1) current user must be owner
  const { data: ownerMember, error: ownerError } = await supabase
    .from("campaign_members")
    .select("id, role")
    .eq("campaign_id", params.campaignId)
    .eq("user_id", user.id)
    .single();

  if (ownerError || !ownerMember || ownerMember.role !== "owner") {
    return NextResponse.json(
      { error: "Only campaign owner can manage members" },
      { status: 403 }
    );
  }

  // 2) don't allow removing owner membership
  const { data: target, error: targetError } = await supabase
    .from("campaign_members")
    .select("id, user_id, role")
    .eq("campaign_id", params.campaignId)
    .eq("user_id", params.memberUserId)
    .single();

  if (targetError || !target) {
    return NextResponse.json(
      { error: "Member not found on this campaign" },
      { status: 404 }
    );
  }

  if (target.role === "owner") {
    return NextResponse.json(
      { error: "Cannot remove the campaign owner" },
      { status: 400 }
    );
  }

  const { error: deleteError } = await supabase
    .from("campaign_members")
    .delete()
    .eq("id", target.id);

  if (deleteError) {
    console.error("Failed to remove campaign member:", deleteError);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: "ok" });
}































































