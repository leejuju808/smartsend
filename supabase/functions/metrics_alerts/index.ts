import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type KPI = {
  backlog: number;
  replies_7d: number;
  ooo_7d: number;
  ooo_pct_7d: number | null;
  reviewed_30d: number;
  fp_ooo_30d: number;
  fp_pct_30d: number | null;
};

function fmt(n: number | null | undefined) {
  return n ?? 0;
}

async function postWebhook(url: string, text: string) {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    // ignore failures; we don't want to break the job if the webhook fails
  }
}

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const [{ data: backlog }, { data: ooo }, { data: fp }] = await Promise.all([
    supabase.from("v_review_backlog").select("*").single(),
    supabase.from("v_kpi_ooo_capture").select("*").single(),
    supabase.from("v_kpi_fp_rate").select("*").single(),
  ]);

  const kpi: KPI = {
    backlog: backlog?.open_count ?? 0,
    replies_7d: ooo?.replies_7d ?? 0,
    ooo_7d: ooo?.ooo_7d ?? 0,
    ooo_pct_7d: ooo?.ooo_pct_7d ?? null,
    reviewed_30d: fp?.reviewed_30d ?? 0,
    fp_ooo_30d: fp?.fp_ooo_30d ?? 0,
    fp_pct_30d: fp?.fp_pct_30d ?? null,
  };

  const BACKLOG_WARN = Number(Deno.env.get("BACKLOG_WARN") ?? 25);
  const FP_PCT_WARN = Number(Deno.env.get("FP_PCT_WARN") ?? 8);

  const lines = [
    "⚡ SmartSend — Reply Classifier KPIs",
    `Backlog: ${kpi.backlog}`,
    `OOO capture (7d): ${fmt(kpi.ooo_7d)}/${fmt(kpi.replies_7d)} = ${kpi.ooo_pct_7d ?? 0}%`,
    `False-positives (30d): ${fmt(kpi.fp_ooo_30d)}/${fmt(kpi.reviewed_30d)} = ${kpi.fp_pct_30d ?? 0}%`,
  ];

  const msg = lines.join("\n");

  const slackUrl = Deno.env.get("SLACK_WEBHOOK_URL") ?? "";
  const telegramUrl = Deno.env.get("TELEGRAM_WEBHOOK_URL") ?? "";

  if (slackUrl) await postWebhook(slackUrl, msg);
  if (telegramUrl) await postWebhook(telegramUrl, msg);

  const alerts: string[] = [];
  if (kpi.backlog >= BACKLOG_WARN) {
    alerts.push(`🟠 Review backlog high: ${kpi.backlog} (>= ${BACKLOG_WARN})`);
  }
  if ((kpi.fp_pct_30d ?? 0) >= FP_PCT_WARN) {
    alerts.push(`🟠 FP rate high: ${kpi.fp_pct_30d}% (>= ${FP_PCT_WARN}%)`);
  }

  if (alerts.length) {
    const alertMsg = `🚨 SmartSend Alerts\n${alerts.join("\n")}`;
    if (slackUrl) await postWebhook(slackUrl, alertMsg);
    if (telegramUrl) await postWebhook(telegramUrl, alertMsg);
  }

  return new Response(
    JSON.stringify({ ok: true, kpi }),
    { headers: { "content-type": "application/json" } },
  );
});
