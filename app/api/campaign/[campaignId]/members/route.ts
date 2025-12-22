import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { assertViewer } from "@/lib/acl";

export async function GET(
  _req: NextRequest,
  { params }: { params: { campaignId: string } },
) {
  try {
    await assertViewer(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createRouteHandlerClient({ cookies });

  const [members, invites] = await Promise.all([
    supabase
      .from("campaign_members")
      .select("user_id, role, created_at")
      .eq("campaign_id", params.campaignId)
      .order("created_at", { ascending: true }),
    supabase
      .from("campaign_invites")
      .select("email, role, created_at, expires_at, status, token")
      .eq("campaign_id", params.campaignId)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
  ]);

  if (members.error) {
    return NextResponse.json({ error: members.error.message }, { status: 500 });
  }
  if (invites.error) {
    return NextResponse.json({ error: invites.error.message }, { status: 500 });
  }

  return NextResponse.json({
    members: members.data ?? [],
    invites: invites.data ?? [],
  });
}

