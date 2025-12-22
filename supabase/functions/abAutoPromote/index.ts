import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/** Two-proportion z-test (pooled). Returns p-value (two-tailed). */
function twoPropP(aSucc: number, aN: number, bSucc: number, bN: number) {
  if (aN === 0 || bN === 0) return 1;
  const p = (aSucc + bSucc) / (aN + bN);
  const se = Math.sqrt(p * (1 - p) * (1 / aN + 1 / bN));
  if (se === 0) return 1;
  const z = (aSucc / aN - bSucc / bN) / se;
  const cdf = (x: number) => 0.5 * (1 + erf(x / Math.sqrt(2)));
  const erf = (x: number) => {
    // Abramowitz-Stegun approximation
    const sign = x < 0 ? -1 : 1;
    const t = 1 / (1 + 0.3275911 * Math.abs(x));
    const y = 1 - (((((
      1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t)
      * Math.exp(-x * x);
    return sign * y;
  };
  const pval = 2 * (1 - cdf(Math.abs(z)));
  return pval;
}

serve(async (req) => {
  try {
    const { campaign_id, org_id } = await req.json();

    // Load campaign; proceed only in ab_mode 'even' or 'weighted'
    const { data: camp, error: cErr } = await supa
      .from("campaigns")
      .select("id, org_id, ab_mode, template_id")
      .eq("id", campaign_id).single();
    if (cErr || !camp) throw new Error("Campaign not found");
    if (camp.org_id !== org_id) throw new Error("Org mismatch");
    if (!["even","weighted"].includes(camp.ab_mode)) {
      return new Response(JSON.stringify({ ok: true, skipped: "Not in AB mode" }), { status: 200 });
    }

    // thresholds
    const { data: setts } = await supa.from("ab_settings").select("*").eq("id",1).maybeSingle();
    const MIN_SENDS = setts?.min_sends ?? 200;
    const MIN_VAR = setts?.min_variant_sends ?? 50;
    const MIN_DIFF = setts?.min_reply_rate_diff ?? 5.0;
    const SIG = setts?.sig_level ?? 0.05;

    // fetch variant summaries for this campaign
    const { data: rows, error: vErr } = await supa
      .from("campaign_variant_summary")
      .select("*").eq("campaign_id", campaign_id);
    if (vErr) throw vErr;
    if (!rows || rows.length < 2) {
      return new Response(JSON.stringify({ ok: true, skipped: "Need ≥2 variants" }), { status: 200 });
    }

    const totalSends = rows.reduce((s:any,r:any)=>s+r.sends,0);
    if (totalSends < MIN_SENDS) {
      return new Response(JSON.stringify({ ok: true, skipped: "Not enough total sends" }), { status: 200 });
    }

    // filter variants with enough data
    const eligible = rows.filter(r => r.sends >= MIN_VAR);
    if (eligible.length < 2) {
      return new Response(JSON.stringify({ ok: true, skipped: "Not enough per-variant sends" }), { status: 200 });
    }

    // pick best by replies/sends
    eligible.sort((a,b) => (b.replies/b.sends) - (a.replies/a.sends));
    const winner = eligible[0];
    const contender = eligible[1];

    const diffPct = (winner.replies/winner.sends - contender.replies/contender.sends) * 100;

    // significance test (two-proportion z)
    const pval = twoPropP(winner.replies, winner.sends, contender.replies, contender.sends);

    if (diffPct >= MIN_DIFF && pval <= SIG) {
      // Promote
      const { error: uErr } = await supa
        .from("campaigns")
        .update({ ab_mode: "single" })
        .eq("id", campaign_id);
      if (uErr) throw uErr;

      // Log promotion with structured meta
      await supa.from("campaign_logs").insert({
        org_id,
        campaign_id,
        action: "ab_winner_promoted",
        message: `Promoted variant ${winner.template_variant_id} (p=${pval.toFixed(3)}, Δ=${diffPct.toFixed(2)}pp)`,
        meta: {
          template_variant_id: winner.template_variant_id,
          p_value: pval,
          diff_pct: diffPct,
          winner_replies: winner.replies,
          winner_sends: winner.sends,
          contender_replies: contender.replies,
          contender_sends: contender.sends
        }
      });

      // Optional: write a flag to campaigns or a separate table for UI badge
      return new Response(JSON.stringify({ ok: true, promoted_variant_id: winner.template_variant_id, pval, diffPct }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true, skipped: "No significant winner", pval, diffPct }), { status: 200 });
  } catch (e:any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
});

