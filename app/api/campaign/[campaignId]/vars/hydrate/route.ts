import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const leadId = url.searchParams.get("leadId");

  if (!leadId) {
    return NextResponse.json({ error: "missing leadId" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("hydrate_campaign_vars", {
    p_campaign: params.campaignId,
    p_lead: leadId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ vars: data ?? {} });
}



