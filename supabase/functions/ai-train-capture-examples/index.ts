import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Call this inside your training pipeline right after you assemble the rows for JSONL.
 * Provide: training_job_id, rows: [{message_id,label,text_excerpt,source,ref_id}]
 */
serve(async (req) => {
  const { training_job_id, rows } = await req.json();
  const s = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (!Array.isArray(rows) || !rows.length) {
    return respond({ ok: false, error: 'no rows' }, 400);
  }

  const payload = rows.map((r: any) => ({
    training_job_id,
    message_id: r.message_id,
    label: r.label,
    source: r.source || 'feedback',
    ref_id: r.ref_id || null,
    text_excerpt: String(r.text_excerpt || '').slice(0, 4000)
  }));

  const { error } = await s.from('ai_training_examples').insert(payload);
  if (error) return respond({ ok: false, error: error.message }, 500);
  return respond({ ok: true, inserted: payload.length });
});

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
