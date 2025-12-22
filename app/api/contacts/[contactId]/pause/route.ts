import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(
  req: Request,
  { params }: { params: { contactId: string } }
) {
  const sb = createRouteHandlerClient({ cookies });
  const { campaignId, until, reason } = await req.json(); // reason default 'manual'
  
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }
  
  const { error } = await sb.from("campaign_contacts").update({
    is_paused: true,
    pause_reason: reason ?? 'manual',
    pause_until: until ?? null
  }).eq("campaign_id", campaignId).eq("contact_id", params.contactId);
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  
  return NextResponse.json({ ok: true });
}















