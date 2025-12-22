import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const PAGE = 25;

export async function GET(req: NextRequest, { params }: { params: { campaignId: string; id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const before = url.searchParams.get("before");

  let query = supabase
    .from("webhook_deliveries")
    .select("id,created_at,event_id,attempt,status,response_status,response_ms,error")
    .eq("campaign_id", params.campaignId)
    .eq("webhook_id", params.id)
    .order("created_at", { ascending: false })
    .limit(PAGE + 1);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = data ?? [];
  const nextCursor = items.length > PAGE ? items[PAGE].created_at : null;

  return NextResponse.json({ deliveries: items.slice(0, PAGE), nextCursor });
}

export async function POST(req: NextRequest, { params }: { params: { campaignId: string; id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const webhookId = params.id;
  const { id } = await req.json().catch(() => ({}));

  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("webhook_deliveries")
    .update({ status: "failed", next_attempt_at: new Date().toISOString() })
    .eq("id", id)
    .eq("campaign_id", params.campaignId)
    .eq("webhook_id", webhookId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}




