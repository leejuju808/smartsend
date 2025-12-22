// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return new Response(
      JSON.stringify({ ok: false, error: "missing_env" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json"
  };

  const [goalsRes, kpisRes] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/meeting_goals?select=*`, { headers }),
    fetch(`${supabaseUrl}/rest/v1/v_campaign_meeting_kpis?select=*`, { headers })
  ]);

  if (!goalsRes.ok || !kpisRes.ok) {
    console.error("Failed to load goals or KPIs", { goals: goalsRes.status, kpis: kpisRes.status });
    return new Response(
      JSON.stringify({ ok: false, error: "fetch_failed" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const goals = await goalsRes.json();
  const kpis = await kpisRes.json();

  const alerts: any[] = [];

  for (const goal of goals) {
    const kpi = kpis.find((k: any) => k.campaign_id === goal.campaign_id);
    if (!kpi) continue;

    const conversion = kpi.intent_to_booked_pct ?? 0;
    const speed = kpi.p50_intent_to_book_sec ?? 999999;

    if (conversion < goal.intent_to_booked_target) {
      alerts.push({
        campaign_id: goal.campaign_id,
        metric: "conversion",
        actual: conversion,
        target: goal.intent_to_booked_target,
        level: conversion < goal.intent_to_booked_target * 0.5 ? "critical" : "warn",
        message: `Booking rate dropped to ${conversion}% (target ${goal.intent_to_booked_target}%)`,
        sent_to: goal.alert_recipients
      });
    }

    if (speed > goal.median_book_time_target) {
      alerts.push({
        campaign_id: goal.campaign_id,
        metric: "speed",
        actual: speed,
        target: goal.median_book_time_target,
        level: "warn",
        message: `Median booking delay ${Math.round(speed / 3600)}h > target ${Math.round(goal.median_book_time_target / 3600)}h`,
        sent_to: goal.alert_recipients
      });
    }
  }

  if (alerts.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, alerts: 0 }),
      { headers: { "content-type": "application/json" } }
    );
  }

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/meeting_alerts`, {
    method: "POST",
    headers,
    body: JSON.stringify(alerts)
  });

  if (!insertRes.ok) {
    console.error("Failed to insert meeting alerts", insertRes.status, await insertRes.text());
    return new Response(
      JSON.stringify({ ok: false, error: "insert_failed" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const webhook = Deno.env.get("ALERT_WEBHOOK_URL");
  for (const alert of alerts) {
    const msg = `⚠️ [${(alert.level as string).toUpperCase()}] ${alert.message}`;
    console.log(msg);
    if (webhook) {
      await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: msg })
      }).catch((err) => console.error("Webhook send failed", err));
    }
  }

  return new Response(
    JSON.stringify({ ok: true, alerts: alerts.length }),
    { headers: { "content-type": "application/json" } }
  );
});

