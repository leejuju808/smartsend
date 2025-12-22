import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { setAccountContext } from "@/app/api/_utils/account";

export async function POST(
  _req: NextRequest,
  { params }: { params: { auditId: string } }
) {
  const supabase = createClient();
  await setAccountContext(supabase);
  const startedAt = Date.now();
  const { data, error } = await supabase.rpc("undo_merge", {
    p_audit_id: params.auditId,
  });
  const latencyMs = Date.now() - startedAt;

  if (error) {
    const { error: logError } = await supabase.rpc("log_event", {
      p_kind: "undo_merge",
      p_status: "error",
      p_latency_ms: latencyMs,
      p_count_int: null,
      p_ref_id: params.auditId,
      p_message: error.message,
      p_context: {},
    });
    if (logError) {
      console.error("Failed to log undo_merge error event", logError);
    }

    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data ?? {});
}


