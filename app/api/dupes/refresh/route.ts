import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { setAccountContext } from "@/app/api/_utils/account";

export async function POST() {
  const supabase = createClient();
  await setAccountContext(supabase);

  const startedAt = Date.now();
  const { data, error } = await supabase.rpc("refresh_lead_dupe_candidates", {});
  const latencyMs = Date.now() - startedAt;

  if (error) {
    const { error: logError } = await supabase.rpc("log_event", {
      p_kind: "dupes_refresh",
      p_status: "error",
      p_latency_ms: latencyMs,
      p_count_int: null,
      p_ref_id: null,
      p_message: error.message,
      p_context: {},
    });
    if (logError) {
      console.error("Failed to log dupes_refresh error event", logError);
    }

    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ inserted: data ?? 0 });
}

