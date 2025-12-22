import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { setAccountContext } from "@/app/api/_utils/account";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 100);
  const offset = Number(searchParams.get("offset") ?? 0);

  const supabase = createClient();
  await setAccountContext(supabase);

  const startedAt = Date.now();
  const { data, error } = await supabase.rpc("apply_saved_view_generic", {
    p_saved_view_id: params.id,
    p_limit: limit,
    p_offset: offset,
  });
  const latencyMs = Date.now() - startedAt;

  if (error) {
    const { error: logError } = await supabase.rpc("log_event", {
      p_kind: "saved_view_query",
      p_status: "error",
      p_latency_ms: latencyMs,
      p_count_int: null,
      p_ref_id: params.id,
      p_message: error.message,
      p_context: { limit, offset },
    });
    if (logError) {
      console.error("Failed to log saved_view_query error event", logError);
    }

    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = data ?? [];

  const { error: logError } = await supabase.rpc("log_event", {
    p_kind: "saved_view_query",
    p_status: "ok",
    p_latency_ms: latencyMs,
    p_count_int: rows.length,
    p_ref_id: params.id,
    p_message: null,
    p_context: { limit, offset },
  });
  if (logError) {
    console.error("Failed to log saved_view_query event", logError);
  }

  return NextResponse.json({ rows });
}

