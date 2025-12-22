++ 0
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const meetingBridgePushUrl = process.env.MEETING_BRIDGE_PUSH_URL!;

type CalendarProvider = "google" | "outlook" | "none";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ ok: false, error: "supabase_env_missing" }, { status: 500 });
  }
  if (!meetingBridgePushUrl) {
    return NextResponse.json({ ok: false, error: "push_url_missing" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  const intentId = params.id;

  const { data: intent, error: intentError } = await supabase
    .from("meeting_intents")
    .select("id, account_id")
    .eq("id", intentId)
    .maybeSingle();

  if (intentError) {
    return NextResponse.json({ ok: false, error: intentError.message }, { status: 500 });
  }
  if (!intent) {
    return NextResponse.json({ ok: false, error: "intent_not_found" }, { status: 404 });
  }

  const { data: conn } = await supabase
    .from("account_integrations")
    .select("provider")
    .eq("account_id", intent.account_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const provider = (conn?.provider ?? "none") as CalendarProvider;

  const { error: finalizeError } = await supabase.rpc("rpc_finalize_meeting_intent", {
    p_intent_id: intentId,
    p_summary: "Intro call",
    p_description: "Created via SmartSend",
    p_provider: provider,
  });

  if (finalizeError) {
    return NextResponse.json({ ok: false, error: finalizeError.message }, { status: 500 });
  }

  const pushRes = await fetch(meetingBridgePushUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent_id: intentId }),
  });

  const pushJson = await pushRes.json().catch(() => ({ ok: false, error: "invalid_response" }));

  return NextResponse.json(pushJson, { status: pushRes.status });
}


