// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Row = Record<string, any>;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

Deno.serve(async () => {
  const nowISO = new Date().toISOString();

  const [rulesRes, kpisRes, goalsRes, mixesRes] = await Promise.all([
    sb.from("followup_rules").select("*").eq("auto_optimize", true),
    sb.from("v_campaign_meeting_kpis").select("*"),
    sb.from("meeting_goals").select("*"),
    sb.from("v_reply_mix_7d").select("*"),
  ]);

  const { data: rules, error: rulesError } = rulesRes;
  const { data: kpis, error: kpisError } = kpisRes;
  const { data: goals, error: goalsError } = goalsRes;
  const { data: mixes, error: mixesError } = mixesRes;

  if (rulesError) {
    return new Response(JSON.stringify({ ok: false, error: rulesError.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  if (kpisError || goalsError || mixesError) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: kpisError?.message ?? goalsError?.message ?? mixesError?.message ?? "fetch_failed",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }

  const results: any[] = [];

  for (const r of rules ?? []) {
    const campaign_id = r.campaign_id;
    const k: Row = kpis?.find((x) => x.campaign_id === campaign_id) ?? {};
    const g: Row =
      goals?.find((x) => x.campaign_id === campaign_id) ?? {
        intent_to_booked_target: 40.0,
        median_book_time_target: 86400,
      };
    const m: Row = mixes?.find((x) => x.campaign_id === campaign_id) ?? { total_inbound: 0, negativeish: 0 };

    const conv = Number(k.intent_to_booked_pct ?? 0);
    const ttb = Number(k.p50_intent_to_book_sec ?? 999999);
    const negRate = m.total_inbound ? (Number(m.negativeish ?? 0) / Number(m.total_inbound ?? 1)) * 100 : 0;

    let hours_wait = Number(r.hours_wait ?? 48);
    let max_nudges = Number(r.max_nudges ?? 2);
    let tone = r.tone ?? "professional";

    const min_hours_wait = Number(r.min_hours_wait ?? 12);
    const max_hours_wait = Number(r.max_hours_wait ?? 72);
    const step_hours = Number(r.step_hours ?? 6);
    const max_nudges_min = Number(r.max_nudges_min ?? 1);
    const max_nudges_max = Number(r.max_nudges_max ?? 4);
    const tone_pool = Array.isArray(r.tone_pool) ? r.tone_pool : ["professional", "friendly", "concise"];

    const before = {
      hours_wait,
      max_nudges,
      tone,
      labels: r.labels,
      auto_send: r.auto_send,
    };

    const reasonParts: string[] = [];

    // Underperforming booking conversion or too slow: tighten (down to min)
    if (conv < Number(g.intent_to_booked_target ?? 0) || ttb > Number(g.median_book_time_target ?? 0)) {
      const newHours = Math.max(min_hours_wait, hours_wait - (step_hours || 6));
      if (newHours !== hours_wait) {
        hours_wait = newHours;
        reasonParts.push(`tighten_wait (${hours_wait}h)`);
      }

      const newNudges = Math.min(max_nudges_max, (max_nudges || 2) + 1);
      if (newNudges !== max_nudges) {
        max_nudges = newNudges;
        reasonParts.push(`more_nudges (${max_nudges})`);
      }

      if (tone_pool.includes("concise") && tone !== "concise") {
        tone = "concise";
        reasonParts.push("tone->concise");
      }
    }

    // If negativity high: soften (up to max)
    if (negRate >= 20) {
      const newHours = Math.min(max_hours_wait, hours_wait + (step_hours || 6));
      if (newHours !== hours_wait) {
        hours_wait = newHours;
        reasonParts.push(`soften_wait (${hours_wait}h)`);
      }

      const newNudges = Math.max(max_nudges_min, (max_nudges || 2) - 1);
      if (newNudges !== max_nudges) {
        max_nudges = newNudges;
        reasonParts.push(`fewer_nudges (${max_nudges})`);
      }

      if (tone_pool.includes("friendly") && tone !== "friendly") {
        tone = "friendly";
        reasonParts.push("tone->friendly");
      }
    }

    if (!reasonParts.length) {
      continue;
    }

    const after = { hours_wait, max_nudges, tone };
    const reason = [
      `conv=${conv}% (target ${g.intent_to_booked_target ?? "n/a"}%)`,
      `p50=${Math.round(ttb / 3600)}h (target ${Math.round(Number(g.median_book_time_target ?? 0) / 3600)}h)`,
      `neg=${negRate.toFixed(1)}%`,
    ].join(", ") + " | " + reasonParts.join("; ");

    const { error: updateError } = await sb
      .from("followup_rules")
      .update({
        hours_wait,
        max_nudges,
        tone,
        last_optimized_at: nowISO,
        optimization_notes: reason,
      })
      .eq("campaign_id", campaign_id)
      .select("campaign_id");

    if (updateError) {
      reasonParts.push(`update_failed (${updateError.message})`);
      continue;
    }

    const { error: auditError } = await sb.from("followup_rule_audit").insert({
      campaign_id,
      user_id: null,
      before,
      after,
      reason,
    });

    if (auditError) {
      reasonParts.push(`audit_failed (${auditError.message})`);
    }

    results.push({ campaign_id, before, after, reason });
  }

  return new Response(JSON.stringify({ ok: true, changed: results.length, items: results }), {
    headers: { "content-type": "application/json" },
  });
});

