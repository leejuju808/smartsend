import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { dispatchCampaignWebhooks } from "@/lib/webhooks";

export async function POST(_: NextRequest, { params }: { params: { campaignId: string; inviteId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase.rpc("cancel_campaign_invite", {
    p_invite: params.inviteId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await dispatchCampaignWebhooks(params.campaignId);

  return NextResponse.json({ ok: !!data });
}


