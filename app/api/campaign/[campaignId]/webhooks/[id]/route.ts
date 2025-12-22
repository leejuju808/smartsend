import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function DELETE(
  _: NextRequest,
  { params }: { params: { campaignId: string; id: string } },
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { error } = await supabase
    .from("campaign_webhooks")
    .delete()
    .eq("campaign_id", params.campaignId)
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}





