import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const intentId = params.id;

  const { data: mi, error: fetchError } = await supabase
    .from("meeting_intents")
    .select("id, campaign_id, contact_id, status")
    .eq("id", intentId)
    .single();

  if (fetchError || !mi) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (mi.status !== 'proposed') {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("meeting_intents")
    .update({ status: "accepted" })
    .eq("id", intentId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, intent_id: intentId, status: "accepted" });
}















