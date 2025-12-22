import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { assertEditor } from "@/lib/acl";

export async function POST(
  _req: NextRequest,
  { params }: { params: { campaignId: string; token: string } },
) {
  try {
    await assertEditor(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { error } = await supabase
    .from("campaign_invites")
    .update({ status: "revoked" })
    .eq("campaign_id", params.campaignId)
    .eq("token", params.token)
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}



