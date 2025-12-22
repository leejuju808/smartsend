// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const body = await req.json().catch(() => ({} as Record<string, any>));
  const size = typeof body.size === "number" ? body.size : 250;
  const name = typeof body.name === "string"
    ? body.name
    : `eval-hard-${new Date().toISOString().slice(0, 10)}-${size}`;
  const notes = typeof body.notes === "string" ? body.notes : "hard-pack";

  const { error: mineErr } = await supabase.rpc("mine_hard_cases", { p_limit: size * 3 });
  if (mineErr) return json({ ok: false, error: mineErr.message }, 500);

  const { data: set, error: setErr } = await supabase
    .from("ai_eval_sets")
    .insert({ name, sample_size: size, source: "hard-pack", notes })
    .select("*")
    .single();
  if (setErr) return json({ ok: false, error: setErr.message }, 500);

  const { data: hard } = await supabase
    .from("ai_hard_cases")
    .select("message_id, reason")
    .order("created_at", { ascending: false })
    .limit(size * 5);

  const msgIds = Array.from(new Set((hard ?? []).map((h: any) => h.message_id))).slice(0, size * 3);
  if (!msgIds.length) return json({ ok: false, error: "no hard cases available" }, 200);

  const { data: msgs } = await supabase
    .from("messages")
    .select("id, body_text, body_html")
    .in("id", msgIds);

  const { data: fb } = await supabase
    .from("ai_feedback")
    .select("message_id, label, confidence")
    .in("message_id", msgIds);

  const goldMap = new Map((fb ?? []).map((x: any) => [x.message_id, x.label]));
  const samples: any[] = [];

  for (const msg of msgs ?? []) {
    const gold = goldMap.get(msg.id);
    if (!gold) continue;
    const txt = (msg.body_text || msg.body_html || "").slice(0, 4000);
    if (txt.trim().length < 10) continue;
    samples.push({
      eval_set_id: set.id,
      message_id: msg.id,
      gold_label: gold,
      text_excerpt: txt,
      meta: {},
    });
    if (samples.length >= size) break;
  }

  if (!samples.length) return json({ ok: false, error: "no gold-labeled hard samples" }, 200);

  const { error: insErr } = await supabase.from("ai_eval_samples").insert(samples);
  if (insErr) return json({ ok: false, error: insErr.message }, 500);

  return json({ ok: true, eval_set_id: set.id, inserted: samples.length });
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

















