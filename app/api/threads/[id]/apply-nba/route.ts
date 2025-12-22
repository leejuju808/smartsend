import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: insight, error } = await supa
    .from("thread_insights")
    .select("*")
    .eq("thread_id", params.id)
    .maybeSingle();

  if (error || !insight) {
    return NextResponse.json({ ok: false, error: "no_insight" }, { status: 404 });
  }

  const { nba_key, nba_payload, account_id } = insight;

  let result: any = null;
  switch (nba_key) {
    case "pause_ooo":
      result = { status: "queued_pause" };
      break;
    case "verify_email":
      result = { status: "queued_verify" };
      break;
    case "route_alt":
      result = { status: "will_send_oos_route" };
      break;
    case "book_meeting":
      result = { status: "meeting_draft", preset: nba_payload?.preset ?? "meeting_confirm" };
      break;
    case "send_case_study":
      result = { status: "queued_case_study" };
      break;
    case "handoff_ae":
      result = { status: "handoff_requested" };
      break;
    case "stop_sequence":
      result = { status: "sequence_stopped" };
      break;
    default:
      result = { status: "noop" };
  }

  return NextResponse.json({ ok: true, result });
}

