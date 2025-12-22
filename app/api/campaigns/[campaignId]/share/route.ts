// app/api/campaigns/[campaignId]/share/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  req: Request,
  { params }: { params: { campaignId: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const campaignId = params.campaignId;
  const { email, role } = await req.json().catch(() => ({}));

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const allowedRoles = ["owner", "editor", "viewer"];
  const requestedRole = allowedRoles.includes(role) ? role : "editor";

  // 1. Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verify the current user is an owner of this campaign
  const { data: myMember, error: myMemberError } = await supabase
    .from("campaign_members")
    .select("role")
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .single();

  if (myMemberError || !myMember || myMember.role !== "owner") {
    return NextResponse.json(
      { error: "Only owners can share this campaign" },
      { status: 403 }
    );
  }

  // 3. Find target user by email (profiles or auth.users)
  const { data: targetProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email")
    .ilike("email", email.trim())
    .single();

  if (profileError || !targetProfile) {
    return NextResponse.json(
      { error: "No user found with that email" },
      { status: 404 }
    );
  }

  const targetUserId = targetProfile.id;

  // Prevent owner accidentally downgrading themselves or making weird loops
  if (targetUserId === user.id && requestedRole !== "owner") {
    // optional: allow, but no real need to change; we can just return ok
    return NextResponse.json({
      status: "ok",
      message: "You are already owner of this campaign",
    });
  }

  // 4. Upsert campaign_members entry
  const { data: member, error: upsertError } = await supabase
    .from("campaign_members")
    .upsert(
      {
        campaign_id: campaignId,
        user_id: targetUserId,
        role: requestedRole,
      },
      {
        onConflict: "campaign_id,user_id",
      }
    )
    .select("id, role")
    .single();

  if (upsertError || !member) {
    console.error("Error upserting campaign_members:", upsertError);
    return NextResponse.json(
      { error: "Failed to share campaign" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: "ok",
    campaign_id: campaignId,
    user_id: targetUserId,
    role: member.role,
  });
}































































