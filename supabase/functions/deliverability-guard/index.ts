// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Row = Record<string, any>;

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(typeof json === "string" ? json : JSON.stringify(json));
  }
  return json;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const campaignId = url.searchParams.get("campaignId");
    const simulate = url.searchParams.get("simulate") === "1";

    const sbUrl = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "return=representation",
    };

    // 1) Load rules (optionally by campaign)
    const rules: Row[] = await fetchJson(
      `${sbUrl}/rest/v1/deliverability_rules?select=*&enabled=is.true${campaignId ? `&campaign_id=eq.${campaignId}` : ""}`,
      { headers },
    );

    const actions: any[] = [];

    for (const rule of rules) {
      const campaign_id: string = rule.campaign_id;

      // Load aggregated metrics (view respects per-campaign window_days)
      const metrics: Row[] = await fetchJson(
        `${sbUrl}/rest/v1/v_guard_metrics?select=*&campaign_id=eq.${campaign_id}`,
        { headers },
      );

      const minSends = rule.min_sends ?? 50;
      const maxBounce = rule.max_bounce_rate ?? 0.08;
      const minOpen = rule.min_open_rate ?? 0.1;
      const minReply = rule.min_reply_rate ?? 0;
      const windowDays = rule.window_days ?? 7;
      const coolHours = rule.cool_hours ?? 12;

      const isVariantBreach = (m: Row) =>
        m.variant_id &&
        m.sends >= minSends &&
        ((m.bounce_rate ?? 0) > maxBounce ||
          (m.open_rate ?? 1) < minOpen ||
          (minReply > 0 && (m.reply_rate ?? 1) < minReply));

      const badVariants = metrics.filter(isVariantBreach);

      // Aggregate to step/account
      const stepAgg = new Map<
        string,
        { sends: number; bounces: number; opens: number; replies: number }
      >();
      const acctAgg = new Map<
        string,
        { sends: number; bounces: number; opens: number; replies: number }
      >();

      for (const m of metrics) {
        const sends = Number(m.sends ?? 0);
        const bounces = Number(m.bounces ?? 0);
        const opens = Number(m.opens ?? 0);
        const replies = Number(m.replies ?? 0);

        if (m.step_id) {
          const k = String(m.step_id);
          const agg = stepAgg.get(k) ?? { sends: 0, bounces: 0, opens: 0, replies: 0 };
          agg.sends += sends;
          agg.bounces += bounces;
          agg.opens += opens;
          agg.replies += replies;
          stepAgg.set(k, agg);
        }
        if (m.account_id) {
          const k = String(m.account_id);
          const agg = acctAgg.get(k) ?? { sends: 0, bounces: 0, opens: 0, replies: 0 };
          agg.sends += sends;
          agg.bounces += bounces;
          agg.opens += opens;
          agg.replies += replies;
          acctAgg.set(k, agg);
        }
      }

      const toStepMetric = ([step_id, agg]: [string, { sends: number; bounces: number; opens: number; replies: number }]) => {
        const sends = agg.sends;
        const bounce_rate = sends > 0 ? agg.bounces / sends : 0;
        const open_rate = sends > 0 ? agg.opens / sends : 0;
        const reply_rate = sends > 0 ? agg.replies / sends : 0;
        return { campaign_id, step_id, sends, bounce_rate, open_rate, reply_rate };
      };

      const toAcctMetric = ([account_id, agg]: [string, { sends: number; bounces: number; opens: number; replies: number }]) => {
        const sends = agg.sends;
        const bounce_rate = sends > 0 ? agg.bounces / sends : 0;
        const open_rate = sends > 0 ? agg.opens / sends : 0;
        const reply_rate = sends > 0 ? agg.replies / sends : 0;
        return { campaign_id, account_id, sends, bounce_rate, open_rate, reply_rate };
      };

      const isBreach = (m: Row) =>
        m.sends >= minSends &&
        ((m.bounce_rate ?? 0) > maxBounce ||
          (m.open_rate ?? 1) < minOpen ||
          (minReply > 0 && (m.reply_rate ?? 1) < minReply));

      const badSteps = [...stepAgg.entries()].map(toStepMetric).filter(isBreach);
      const badAccounts = [...acctAgg.entries()].map(toAcctMetric).filter(isBreach);

      async function canAct(entity_type: "variant" | "step" | "account", entity_id: string) {
        const ev: Row[] = await fetchJson(
          `${sbUrl}/rest/v1/deliverability_events?select=created_at,level&entity_type=eq.${entity_type}&entity_id=eq.${entity_id}&order=created_at.desc&limit=1`,
          { headers },
        );
        if (!ev.length) return true;
        const last = new Date(ev[0].created_at).getTime();
        return (Date.now() - last) >= (coolHours * 60 * 60 * 1000);
      }

      const reasonVariant = (m: Row) => {
        const parts = [
          `bounce=${((m.bounce_rate ?? 0) * 100).toFixed(1)}%>${(maxBounce * 100).toFixed(1)}%`,
          `open=${((m.open_rate ?? 0) * 100).toFixed(1)}%<${(minOpen * 100).toFixed(1)}%`,
        ];
        if (minReply > 0) {
          parts.push(`reply=${((m.reply_rate ?? 0) * 100).toFixed(2)}%<${(minReply * 100).toFixed(2)}%`);
        }
        return `${parts.join(" or ")} in ${windowDays}d; sends=${m.sends}`;
      };

      const reasonStep = (m: Row) =>
        `step KPI breach (${windowDays}d): bounce=${((m.bounce_rate ?? 0) * 100).toFixed(1)}% / open=${((m.open_rate ?? 0) * 100).toFixed(1)}% / reply=${((m.reply_rate ?? 0) * 100).toFixed(2)}%; sends=${m.sends}`;

      const reasonAccount = (m: Row) =>
        `account KPI breach (${windowDays}d): bounce=${((m.bounce_rate ?? 0) * 100).toFixed(1)}% / open=${((m.open_rate ?? 0) * 100).toFixed(1)}%; sends=${m.sends}`;

      // Variant actions
      for (const m of badVariants) {
        const variant_id = String(m.variant_id);
        if (rule.action_on_variant === "none") continue;
        if (!(await canAct("variant", variant_id))) continue;

        const reason = reasonVariant(m);
        actions.push({ type: "variant", id: variant_id, action: rule.action_on_variant, reason });

        if (!simulate) {
          if (rule.action_on_variant === "pause") {
            await fetchJson(`${sbUrl}/rest/v1/step_variants?id=eq.${variant_id}`, {
              method: "PATCH",
              headers: {
                ...headers,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
              },
              body: JSON.stringify([{ active: false, notes: "auto-paused: deliverability guard" }]),
            });
          }

          await fetchJson(`${sbUrl}/rest/v1/deliverability_events`, {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify([{
              campaign_id,
              entity_type: "variant",
              entity_id: variant_id,
              level: rule.action_on_variant === "pause" ? "paused" : "warn",
              reason,
              provider: "guard",
              event_type: "guard",
              meta: m,
            }]),
          });
        }
      }

      // Step actions
      for (const m of badSteps) {
        const step_id = String(m.step_id);
        if (rule.action_on_step === "none") continue;
        if (!(await canAct("step", step_id))) continue;

        const reason = reasonStep(m);
        actions.push({ type: "step", id: step_id, action: rule.action_on_step, reason });

        if (!simulate) {
          if (rule.action_on_step === "pause") {
            await fetchJson(`${sbUrl}/rest/v1/campaign_steps?id=eq.${step_id}`, {
              method: "PATCH",
              headers: {
                ...headers,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
              },
              body: JSON.stringify([{
                paused: true,
                paused_reason: reason,
                paused_at: new Date().toISOString(),
              }]),
            });
          }

          await fetchJson(`${sbUrl}/rest/v1/deliverability_events`, {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify([{
              campaign_id,
              entity_type: "step",
              entity_id: step_id,
              level: rule.action_on_step === "pause" ? "paused" : "warn",
              reason,
              provider: "guard",
              event_type: "guard",
              meta: m,
            }]),
          });
          
          // Log to activity_log
          if (rule.action_on_step === "pause") {
            try {
              const { data: campaign } = await fetchJson(`${sbUrl}/rest/v1/campaigns?id=eq.${campaign_id}&select=account_id,workspace_id,org_id`, { headers });
              const account_id = campaign?.[0]?.account_id || campaign?.[0]?.workspace_id || campaign?.[0]?.org_id;
              if (account_id) {
                await fetchJson(`${sbUrl}/rest/v1/activity_log`, {
                  method: "POST",
                  headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Prefer: "return=minimal",
                  },
                  body: JSON.stringify([{
                    account_id,
                    campaign_id,
                    event_type: "deliverability_pause",
                    meta: { reason, entity_type: "step", entity_id: step_id },
                  }]),
                });
              }
            } catch (activityErr) {
              console.error("Failed to log deliverability pause activity:", activityErr);
            }
          } else {
            try {
              const { data: campaign } = await fetchJson(`${sbUrl}/rest/v1/campaigns?id=eq.${campaign_id}&select=account_id,workspace_id,org_id`, { headers });
              const account_id = campaign?.[0]?.account_id || campaign?.[0]?.workspace_id || campaign?.[0]?.org_id;
              if (account_id) {
                await fetchJson(`${sbUrl}/rest/v1/activity_log`, {
                  method: "POST",
                  headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Prefer: "return=minimal",
                  },
                  body: JSON.stringify([{
                    account_id,
                    campaign_id,
                    event_type: "deliverability_warning",
                    meta: { reason, entity_type: "step", entity_id: step_id },
                  }]),
                });
              }
            } catch (activityErr) {
              console.error("Failed to log deliverability warning activity:", activityErr);
            }
          }
        }
      }

      // Account actions
      for (const m of badAccounts) {
        const account_id = String(m.account_id);
        if (rule.action_on_account === "none") continue;
        if (!(await canAct("account", account_id))) continue;

        const reason = reasonAccount(m);
        actions.push({ type: "account", id: account_id, action: rule.action_on_account, reason });

        if (!simulate) {
          if (rule.action_on_account === "pause") {
            await fetchJson(`${sbUrl}/rest/v1/accounts?id=eq.${account_id}`, {
              method: "PATCH",
              headers: {
                ...headers,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
              },
              body: JSON.stringify([{
                paused: true,
                paused_reason: reason,
                paused_at: new Date().toISOString(),
              }]),
            });
          }

          await fetchJson(`${sbUrl}/rest/v1/deliverability_events`, {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify([{
              campaign_id,
              entity_type: "account",
              entity_id: account_id,
              level: rule.action_on_account === "pause" ? "paused" : "warn",
              reason,
              provider: "guard",
              event_type: "guard",
              meta: m,
            }]),
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, simulate, actions }, null, 2),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

