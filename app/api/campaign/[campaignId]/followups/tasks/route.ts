import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;

  let query = supabase
    .from("followup_tasks")
    .select("id,created_at,thread_id,lead_id,nudge_index,due_at,status,draft_subject,reason,auto_send")
    .eq("campaign_id", params.campaignId)
    .order("due_at", { ascending: true })
    .limit(100);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tasks: data ?? [] });
}

export async function POST(_: NextRequest, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase.rpc("plan_followups", { p_limit: 200 });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ planned: data ?? 0 });
}


