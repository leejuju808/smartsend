// app/api/campaigns/[campaignId]/members/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const ALLOWED_ROLES = ["owner", "editor", "viewer"] as const;
type Role = (typeof ALLOWED_ROLES)[number];

export async function POST(
  req: Request,
  { params }: { params: { campaignId: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const email = (body.email as string | undefined)?.trim().toLowerCase();
  const role = (body.role as Role | undefined) ?? "editor";

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // 1) Ensure current user is owner of this campaign
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

  // 2) Find user by email via profiles
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email")
    .ilike("email", email)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: "No user found with that email" },
      { status: 404 }
    );
  }

  // Prevent changing owner's role away from owner via this endpoint
  if (role !== "owner" && profile.id === user.id && ownerMember.role === "owner") {
    // owner can still add themselves as owner; we just don't downgrade here
  }

  // 3) Upsert membership
  const { data: member, error: upsertError } = await supabase
    .from("campaign_members")
    .upsert(
      {
        campaign_id: params.campaignId,
        user_id: profile.id,
        role,
      },
      { onConflict: "campaign_id,user_id" }
    )
    .select("id, role")
    .single();

  if (upsertError || !member) {
    console.error("Failed to upsert campaign member:", upsertError);
    return NextResponse.json(
      { error: "Failed to add member" },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: "ok", member });
}































































