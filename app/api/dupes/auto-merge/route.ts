import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { resolveAccountContext } from "../_helpers";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const context = await resolveAccountContext(supabase);

  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const role = (context.role ?? "").toLowerCase();
  if (!["owner", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const parsedLimit = Number(limitParam ?? "");
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 1000) : 200;

  const startedAt = Date.now();
  const { data, error } = await supabase.rpc("auto_merge_dupes", { p_limit: limit });
  const latencyMs = Date.now() - startedAt;

  if (error) {
    const { error: logError } = await supabase.rpc("log_event", {
      p_kind: "dupes_auto_merge",
      p_status: "error",
      p_latency_ms: latencyMs,
      p_count_int: null,
      p_ref_id: null,
      p_message: error.message,
      p_context: { limit },
    });
    if (logError) {
      console.error("Failed to log dupes_auto_merge error event", logError);
    }

    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data ?? {});
}
