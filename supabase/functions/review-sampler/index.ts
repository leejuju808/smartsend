import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: recent } = await supabase
    .from("ai_live_inferences")
    .select("id,score,predicted_label,text_preview,threshold")
    .gte("created_at", since);

  const picks =
    recent?.filter((r: any) => {
      const margin = Math.abs((r.score ?? 0) - (r.threshold ?? 0));
      return margin <= 0.05 || Math.random() < 0.01;
    }) ?? [];

  if (!picks.length) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const rows = picks.map((p: any) => ({
    live_inference_id: p.id,
    reason:
      Math.abs((p.score ?? 0) - (p.threshold ?? 0)) <= 0.05
        ? "borderline"
        : "random_sample",
  }));

  await supabase.from("ai_review_queue").insert(rows);

  return new Response(JSON.stringify({ ok: true, queued: rows.length }), {
    status: 200,
  });
});
















