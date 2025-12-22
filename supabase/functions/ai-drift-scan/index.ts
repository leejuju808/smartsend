import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const KL_THRESH = 0.10; // acceptable distribution shift
const ACC_DROP = 0.03;  // 3% absolute accuracy drop

serve(async () => {
  const s = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: dist, error: distError } = await s.from('v_ai_pred_dist_7d').select('*');
  if (distError) {
    return new Response(JSON.stringify({ ok: false, error: distError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { data: acc, error: accError } = await s.from('v_ai_online_acc_7d').select('*');
  if (accError) {
    return new Response(JSON.stringify({ ok: false, error: accError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let alerts = 0;
  for (const d of dist || []) {
    const { data: base, error: baseError } = await s.from('ai_drift_baselines')
      .select('*')
      .eq('model_version_tag', d.version_tag)
      .order('created_at', { ascending: false })
      .limit(1);

    if (baseError) {
      return new Response(JSON.stringify({ ok: false, error: baseError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!base?.length) continue;

    const p = base[0].class_distribution as Record<string, number>;
    const q = d.class_distribution as Record<string, number>;
    const kl = klDiv(p, q);

    if (kl > KL_THRESH) {
      const { error } = await s.from('ai_drift_alerts').insert({
        model_version_tag: d.version_tag,
        window: 'last_7d',
        metric: 'class_distribution',
        delta: kl,
        details: { baseline: p, current: q }
      });
      if (!error) alerts++;
    }

    const a = (acc || []).find((x: any) => x.version_tag === d.version_tag);
    if (a && base[0].avg_confidence && a.accuracy !== null) {
      if (a.n >= 200 && (base[0].avg_confidence - a.accuracy) > ACC_DROP) {
        const { error } = await s.from('ai_drift_alerts').insert({
          model_version_tag: d.version_tag,
          window: 'last_7d',
          metric: 'accuracy',
          delta: Number((base[0].avg_confidence - a.accuracy).toFixed(3)),
          details: { baseline_acc_proxy: base[0].avg_confidence, current_acc: a.accuracy, n: a.n }
        });
        if (!error) alerts++;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, alerts }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

function klDiv(p: Record<string, number>, q: Record<string, number>) {
  const keys = Object.keys(p);
  let s = 0;
  for (const k of keys) {
    const pk = Math.max(1e-6, Number(p[k]));
    const qk = Math.max(1e-6, Number((q as any)[k]));
    s += pk * Math.log(pk / qk);
  }
  return Number(s.toFixed(4));
}
