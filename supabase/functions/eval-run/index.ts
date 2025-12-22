import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const s = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { eval_set_id, model_version_tag, concurrency = 6 } = await req.json();

  // resolve model_version
  const { data: mv, error: mvErr } = await s.from('ai_model_versions').select('*').eq('version_tag', model_version_tag).maybeSingle();
  if (mvErr || !mv) return json({ ok:false, error: 'model_version not found' }, 400);

  // fetch samples
  const { data: samples, error: sErr } = await s.from('ai_eval_samples')
    .select('id, text_excerpt').eq('eval_set_id', eval_set_id).limit(5000);
  if (sErr) return json({ ok:false, error: sErr.message }, 500);

  // budget check (rough projection @ $0.0005 per sample — adjust to your model)
  const projection = (samples?.length ?? 0) * 0.0005;
  const { allowed, hardStop, limit, spent } = await checkBudget('openai', projection);
  if (!allowed && hardStop) return json({ ok:false, error: `Budget exceeded ($${spent.toFixed(2)}/${limit.toFixed(2)})` }, 402);

  // dynamic import adapters compiled into Next (we’ll just inline minimal call here)
  const classify = async (text: string) => {
    // Call your classify API (which uses provider adapter) to avoid bundling node deps in Deno:
    const r = await fetch(Deno.env.get("NEXT_PUBLIC_BASE_URL") + "/api/ai/_internal/classify", {
      method: "POST",
      headers: { "Content-Type":"application/json", "X-Internal-Token": Deno.env.get("INTERNAL_TOKEN")! },
      body: JSON.stringify({ text, model_version_tag })
    });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  };

  let ok = 0, fail = 0, inTok = 0, outTok = 0;
  const started = Date.now();

  // parallel map with backoff
  const queue = [...(samples ?? [])];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
  await Promise.all(workers);

  async function worker(){
    let row;
    while ((row = queue.pop())) {
      const t0 = Date.now();
      try {
        const res = await withBackoff(() => classify(row.text_excerpt), 3, 250);
        const latency = Date.now() - t0;
        await s.from('ai_eval_results').insert({
          eval_set_id, model_version_id: mv.id, sample_id: row.id,
          pred_label: res.label, pred_confidence: res.confidence, latency_ms: latency, raw: res.raw ?? null
        });
        ok++; inTok += (res.usage?.input_tokens ?? 0); outTok += (res.usage?.output_tokens ?? 0);
      } catch (e) {
        fail++;
      }
    }
  }

  // record approximate cost
  const cost = estimateCostUSD(inTok, outTok, mv.model);
  await s.from('ai_cost_ledger').insert({
    provider: 'openai', model: mv.model, usage_type: 'eval',
    calls: ok, input_tokens: inTok, output_tokens: outTok, cost_usd: cost
  });

  return json({ ok:true, evaluated: ok, failed: fail, tokens: { in: inTok, out: outTok }, elapsed_ms: Date.now()-started, cost_usd: cost });
});

function estimateCostUSD(inputTokens: number, outputTokens: number, model: string){
  // Adjust with your current model pricing
  const inRate = 0.0000005;  // $/token
  const outRate = 0.0000015;
  return Number((inputTokens*inRate + outputTokens*outRate).toFixed(4));
}

async function withBackoff<T>(fn:()=>Promise<T>, retries=3, base=300): Promise<T> {
  let err;
  for (let i=0;i<=retries;i++){
    try { return await fn(); } catch(e){ err=e; await new Promise(r=>setTimeout(r, base*Math.pow(2,i))); }
  }
  throw err;
}

async function checkBudget(provider: string, projected: number){
  const url = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(`${url}/rest/v1/ai_cost_budget?provider=eq.${provider}&select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const cap = (await r.json())[0];
  if (!cap) return { allowed: true, hardStop: false, limit: 9999, spent: 0 };
  const day = new Date().toISOString().slice(0,10);
  const r2 = await fetch(`${url}/rest/v1/ai_cost_ledger?created_at=gte.${day}T00:00:00Z&select=cost_usd`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const rows = await r2.json();
  const spent = rows.reduce((a:number,x:any)=>a+Number(x.cost_usd||0),0);
  return { allowed: (spent+projected)<=Number(cap.daily_cap_usd), hardStop: !!cap.hard_stop, limit: Number(cap.daily_cap_usd), spent };
}

function json(b:any,s=200){ return new Response(JSON.stringify(b),{status:s,headers:{'Content-Type':'application/json'}}); }