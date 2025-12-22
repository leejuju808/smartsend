// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

type Rule = {
  account_id: string;
  min_sends: number;
  promote_delta: number;
  demote_delta: number;
  max_live_versions: number;
  cooloff_days: number;
};

type PerfRow = {
  version_id: string;
  sends_14d: number | null;
  reply_rate_smoothed: number | null;
};

type VersionMeta = {
  id: string;
  created_at: string;
};

function enough(row: PerfRow, min: number) {
  return (row.sends_14d ?? 0) >= min;
}

async function fetchVersionMeta(templateId: string) {
  const { data } = await sb
    .from("smart_template_versions")
    .select("id, created_at, status")
    .eq("template_id", templateId);
  const live: string[] = [];
  const meta: Record<string, VersionMeta> = {};
  for (const row of data ?? []) {
    meta[row.id] = { id: row.id, created_at: row.created_at };
    if (row.status === "live") live.push(row.id);
  }
  return { liveIds: live, meta };
}

async function hasRecentJob(templateId: string, versionId: string, days: number) {
  if (!days || days <= 0) return false;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await sb
    .from("template_rewrite_jobs")
    .select("id, status")
    .eq("template_id", templateId)
    .eq("base_version_id", versionId)
    .eq("reason", "low_performance")
    .gte("created_at", since)
    .limit(1);
  return !!data?.length;
}

async function queueRewrite(params: { account_id: string; template_id: string; version_id: string }) {
  const { error } = await sb.from("template_rewrite_jobs").insert({
    account_id: params.account_id,
    template_id: params.template_id,
    base_version_id: params.version_id,
    reason: "low_performance",
    target_variants: 2
  });
  if (error && !error.message.includes("duplicate key")) {
    throw new Error(error.message);
  }
}

Deno.serve(async () => {
  let queued = 0;
  let promoted = 0;
  let disabled = 0;

  const { data: rules, error: rulesError } = await sb
    .from("template_auto_rules")
    .select("*");

  if (rulesError) {
    return new Response(
      JSON.stringify({ error: rulesError.message }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  for (const rule of rules ?? []) {
    const { data: templates } = await sb
      .from("smart_templates")
      .select("id")
      .eq("account_id", rule.account_id)
      .eq("status", "active");

    for (const template of templates ?? []) {
      const { data: perf } = await sb
        .from("v_template_version_perf")
        .select("*")
        .eq("template_id", template.id);
      if (!perf?.length) continue;

      const { liveIds, meta } = await fetchVersionMeta(template.id);
      if (!liveIds.length) continue;

      const livePerf = perf.filter((row) => liveIds.includes(row.version_id));
      const candidatePerf = perf.filter((row) => !liveIds.includes(row.version_id));

      const control = livePerf
        .slice()
        .sort((a, b) => (b.sends_14d ?? 0) - (a.sends_14d ?? 0))[0];
      if (!control || !enough(control, rule.min_sends)) continue;

      for (const candidate of candidatePerf) {
        if (!enough(candidate, rule.min_sends)) continue;
        const delta = (candidate.reply_rate_smoothed ?? 0) - (control.reply_rate_smoothed ?? 0);
        if (delta >= rule.promote_delta) {
          await sb
            .from("smart_template_versions")
            .update({ status: "live", weight: 1.0 })
            .eq("id", candidate.version_id);
          promoted += 1;

          const { liveIds: liveNow } = await fetchVersionMeta(template.id);
          if (liveNow.length > rule.max_live_versions) {
            const weakest = livePerf
              .slice()
              .sort((a, b) => (a.reply_rate_smoothed ?? 0) - (b.reply_rate_smoothed ?? 0))[0];
            if (weakest) {
              await sb
                .from("smart_template_versions")
                .update({ status: "disabled", weight: 0 })
                .eq("id", weakest.version_id);
              disabled += 1;
            }
          }
        }
      }

      for (const live of livePerf) {
        if (!enough(live, rule.min_sends)) continue;
        const delta = (live.reply_rate_smoothed ?? 0) - (control.reply_rate_smoothed ?? 0);
        if (delta <= rule.demote_delta) {
          const versionMeta = meta[live.version_id];
          if (versionMeta) {
            const createdAt = new Date(versionMeta.created_at).getTime();
            const cutoff = Date.now() - rule.cooloff_days * 24 * 60 * 60 * 1000;
            if (createdAt > cutoff) continue;
          }
          if (await hasRecentJob(template.id, live.version_id, rule.cooloff_days)) continue;

          await queueRewrite({
            account_id: rule.account_id,
            template_id: template.id,
            version_id: live.version_id
          });
          queued += 1;
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ queued, promoted, disabled }),
    { headers: { "content-type": "application/json" } }
  );
});

