import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const THRESH = 0.02;
  const MIN_N = 300;

  const { data: pol } = await supabase.from("ai_routing_policy").select("*").eq("name", "replies-cls").maybeSingle();
  if (!pol?.canary_version_tag) return json({ ok: false, error: "no canary set" }, 200);

  const { data: acc } = await supabase.from("v_ai_online_accuracy").select("*")
    .in("version_tag", [pol.current_version_tag, pol.canary_version_tag]);
  const cur = acc?.find((a) => a.version_tag === pol.current_version_tag);
  const can = acc?.find((a) => a.version_tag === pol.canary_version_tag);

  if (!cur?.n || !can?.n || cur.n < MIN_N || can.n < MIN_N) return json({ ok: false, error: "insufficient samples" }, 200);
  if ((can.accuracy - cur.accuracy) >= THRESH) {
    await supabase.from("ai_model_versions").update({ is_current: false }).eq("version_tag", pol.current_version_tag);
    await supabase.from("ai_model_versions").update({ is_current: true }).eq("version_tag", pol.canary_version_tag);
    await supabase.from("ai_routing_policy").update({
      current_version_tag: pol.canary_version_tag,
      canary_version_tag: null,
      canary_weight: 0,
    }).eq("id", pol.id);

    return json({ ok: true, promoted: pol.canary_version_tag, replaced: pol.current_version_tag });
  }

  return json({ ok: false, error: "not better than threshold" }, 200);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}



















