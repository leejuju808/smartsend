// deno deploy target
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const hours = Number(url.searchParams.get("hours") ?? "48");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const { data: msgs, error } = await supabase
    .from("normalized_messages")
    .select("id, linked_thread_id, sent_at, ai_label, direction")
    .gte("sent_at", since)
    .eq("direction", "inbound")
    .in("ai_label", ["human_reply", "question", "positive", "neutral", "routing"])
    .limit(1000);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  let updated = 0;
  for (const m of msgs ?? []) {
    if (!m.linked_thread_id) continue;

    const { error: rpcErr } = await supabase.rpc("mark_thread_replied", {
      p_thread: m.linked_thread_id,
      p_when: m.sent_at,
      p_reason: "reconcile",
    });

    if (!rpcErr) {
      updated += 1;
    }
  }

  return new Response(
    JSON.stringify({ scanned: msgs?.length ?? 0, updated }),
    {
      headers: { "content-type": "application/json" },
    }
  );
};

Deno.serve(handler);



