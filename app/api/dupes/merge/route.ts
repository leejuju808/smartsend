import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { setAccountContext } from "@/app/api/_utils/account";

const BodySchema = z.object({
  primary: z.string().uuid(),
  secondary: z.string().uuid(),
  strategy: z.enum(["primary_wins", "secondary_wins", "fieldwise"]).default("primary_wins"),
  fieldMap: z.record(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  const supabase = createClient();
  await setAccountContext(supabase);
  const { primary, secondary, strategy, fieldMap } = BodySchema.parse(await request.json());

  const startedAt = Date.now();
  const { data, error } = await supabase.rpc("merge_leads", {
    p_primary: primary,
    p_secondary: secondary,
    p_strategy: strategy,
    p_field_map: fieldMap ?? {},
  });
  const latencyMs = Date.now() - startedAt;

  if (error) {
    const { error: logError } = await supabase.rpc("log_event", {
      p_kind: "merge",
      p_status: "error",
      p_latency_ms: latencyMs,
      p_count_int: null,
      p_ref_id: secondary,
      p_message: error.message,
      p_context: { primary, strategy },
    });
    if (logError) {
      console.error("Failed to log merge error event", logError);
    }

    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data ?? {});
}

