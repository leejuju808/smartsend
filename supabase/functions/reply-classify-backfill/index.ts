import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (_req) => {
  const sb = createClient(SB_URL, SRK);

  const { data: msgs, error } = await sb
    .from("inbox_messages")
    .select("id")
    .eq("direction", "inbound")
    .is("ai_version", null)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  if (!msgs?.length) {
    return new Response(JSON.stringify({ ok: true, count: 0 }), {
      headers: { "content-type": "application/json" }
    });
  }

  for (const m of msgs) {
    await fetch(`${SB_URL}/functions/v1/reply-classify-v2`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${SRK}`
      },
      body: JSON.stringify({ message_id: m.id })
    }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  return new Response(JSON.stringify({ ok: true, count: msgs.length }), {
    headers: { "content-type": "application/json" }
  });
});




