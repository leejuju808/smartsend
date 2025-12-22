import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(_req: Request, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase.rpc("nudge_auto_reweight", {
    p_campaign_id: params.campaignId,
    p_days: 30,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: "reweight_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...data });
}

