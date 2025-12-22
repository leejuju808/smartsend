import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { user_id } = await req.json();
    const sb = createClient(SB_URL, SRK);

    const targetUser = user_id ?? null;

    const { data: ent, error } = await sb.rpc("get_entitlements", {
      p_user_id: targetUser,
    });
    if (error) throw new Error(error.message);

    const plan = ent?.plan ?? "free";
    const usedS = Number(ent?.used_sends ?? 0);
    const usedAI = Number(ent?.used_ai_actions ?? 0);
    const maxS = Number(ent?.monthly_sends ?? 0);
    const maxAI = Number(ent?.monthly_ai_actions ?? 0);

    const canSend = maxS === 0 ? false : usedS < maxS;
    const canAI = maxAI === 0 ? false : usedAI < maxAI;

    return new Response(
      JSON.stringify({
        plan,
        status: ent?.status ?? "none",
        period_end: ent?.period_end ?? null,
        seats: ent?.seats ?? 1,
        feature_flags: ent?.feature_flags ?? {},
        usage: {
          sends: usedS,
          ai_actions: usedAI,
        },
        limits: {
          monthly_sends: maxS,
          monthly_ai_actions: maxAI,
          max_campaigns: Number(ent?.max_campaigns ?? 0),
          max_seats: Number(ent?.max_seats ?? 0),
        },
        canSend,
        canAI,
      }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return new Response(message, { status: 500 });
  }
});





