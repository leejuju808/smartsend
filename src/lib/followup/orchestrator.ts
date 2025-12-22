import { supabaseService } from "@/lib/supabase";
import { followupDelayMultiplierForResilienceMode, normalizeResilienceMode, type ResilienceMode } from "@/lib/resilience/mode";

type RuleAction =
  | { type: "stop"; [key: string]: unknown }
  | { type: "snooze"; until?: string; hours?: number | string; [key: string]: unknown }
  | {
      type: "enqueue";
      delay_hours?: number | string;
      variant_id?: string | null;
      variant_key?: string | null;
      priority?: number;
      [key: string]: unknown;
    };

export type OrchestratorDecision =
  | {
      decision: "skip_suppressed";
      details: { domain: string | null };
    }
  | {
      decision: "stop" | "wait_resume" | "snooze" | "enqueue";
      ruleId: string | null;
      details?: Record<string, unknown> | null;
      sendQueueId?: string | null;
    };

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) >= new Date(b) ? a : b;
}

export async function orchestrateNext(threadId: string): Promise<OrchestratorDecision> {
  const supabase = supabaseService();

  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select("id, campaign_id, lead_id")
    .eq("id", threadId)
    .maybeSingle();

  if (threadError) {
    throw new Error(`thread_fetch_failed:${threadError.message}`);
  }
  if (!thread) {
    throw new Error("thread_not_found");
  }

  // Block 271400: resilience mode influences follow-up pacing (storm/surge slows follow-ups).
  let resilienceMode: ResilienceMode = "normal";
  let reliabilityFollowupMultiplier = 1;
  try {
    const { data: campaignRow } = await supabase
      .from("campaigns")
      .select("workspace_id")
      .eq("id", thread.campaign_id)
      .maybeSingle();
    const workspaceId = (campaignRow as any)?.workspace_id as string | undefined;
    if (workspaceId) {
      const { data: wsRow } = await supabase
        .from("workspaces")
        .select("resilience_mode, reliability_followup_multiplier")
        .eq("id", workspaceId)
        .maybeSingle();
      resilienceMode = normalizeResilienceMode((wsRow as any)?.resilience_mode);
      const raw = Number((wsRow as any)?.reliability_followup_multiplier ?? 1);
      reliabilityFollowupMultiplier = Number.isFinite(raw) ? raw : 1;
      // Clamp safety: tightening is allowed but never extreme.
      reliabilityFollowupMultiplier = Math.max(0.5, Math.min(1.5, reliabilityFollowupMultiplier));
    }
  } catch {
    // best-effort only; never block followups on resilience lookup
    resilienceMode = "normal";
    reliabilityFollowupMultiplier = 1;
  }

  const { data: leadRow, error: leadError } = await supabase
    .from("leads")
    .select("id, email")
    .eq("id", thread.lead_id)
    .maybeSingle();

  if (leadError) {
    throw new Error(`lead_fetch_failed:${leadError.message}`);
  }

  const email = leadRow?.email ?? "";
  const domain = email.includes("@") ? email.split("@")[1]?.toLowerCase() ?? "" : "";

  if (domain) {
    const { data: suppressed, error: suppressError } = await supabase.rpc("domain_is_suppressed", {
      p_domain: domain,
    });

    if (suppressError) {
      throw new Error(`domain_guard_failed:${suppressError.message}`);
    }

    if (suppressed) {
      await supabase.from("followup_decisions").insert({
        thread_id: threadId,
        decision: "skip_suppressed",
        details: { domain },
      });

      return {
        decision: "skip_suppressed",
        details: { domain },
      };
    }
  }

  const { data: ruleRows, error: ruleError } = await supabase.rpc("pick_followup_rule", {
    p_thread: threadId,
  });

  if (ruleError) {
    throw new Error(`rule_pick_failed:${ruleError.message}`);
  }

  const ruleRow = Array.isArray(ruleRows) ? (ruleRows[0] as { rule_id: string; action: RuleAction } | undefined) : undefined;

  if (!ruleRow) {
    await supabase.from("followup_decisions").insert({
      thread_id: threadId,
      decision: "stop",
      details: { reason: "no_rule" },
    });
    return { decision: "stop", ruleId: null, details: { reason: "no_rule" } };
  }

  const ruleId = ruleRow.rule_id;
  const action = ruleRow.action ?? {};

  switch (action.type) {
    case "stop": {
      await supabase.from("followup_decisions").insert({
        thread_id: threadId,
        rule_id: ruleId,
        decision: "stop",
        details: action,
      });
      return { decision: "stop", ruleId, details: action };
    }
    case "snooze": {
      if (typeof action.until === "string" && action.until === "resume_at") {
        await supabase.from("followup_decisions").insert({
          thread_id: threadId,
          rule_id: ruleId,
          decision: "wait_resume",
          details: { reason: "resume_at" },
        });
        return { decision: "wait_resume", ruleId, details: { reason: "resume_at" } };
      }

      const hours = toNumber(action.hours, 48);
      const untilIso = new Date(Date.now() + hours * 3600 * 1000).toISOString();

      await supabase
        .from("inbox_threads")
        .update({ snoozed_until: untilIso })
        .eq("id", threadId);

      await supabase.from("followup_decisions").insert({
        thread_id: threadId,
        rule_id: ruleId,
        decision: "snooze",
        details: { hours, snoozed_until: untilIso },
      });

      return { decision: "snooze", ruleId, details: { hours, snoozed_until: untilIso } };
    }
    case "enqueue": {
      const baseDelayHours = toNumber(action.delay_hours, 24);
      const multiplier = followupDelayMultiplierForResilienceMode(resilienceMode);
      // Block 272100: reliability follow-up multiplier ( <1 = tighter / faster follow-ups )
      const delayHours = Math.max(1, Math.ceil(baseDelayHours * multiplier * reliabilityFollowupMultiplier));
      const requestedIso = new Date(Date.now() + delayHours * 3600 * 1000).toISOString();

      const { data: stoTs, error: stoErr } = await supabase.rpc("next_best_send_ts", {
        p_lead: thread.lead_id,
      });

      if (stoErr) {
        throw new Error(`sto_lookup_failed:${stoErr.message}`);
      }

      const notBefore = maxIso(requestedIso, typeof stoTs === "string" ? stoTs : null) ?? requestedIso;

      const { data: campaignRow, error: campaignError } = await supabase
        .from("campaigns")
        .select("account_id")
        .eq("id", thread.campaign_id)
        .maybeSingle();

      if (campaignError) {
        throw new Error(`campaign_fetch_failed:${campaignError.message}`);
      }

      const accountId = campaignRow?.account_id ?? null;

      if (accountId) {
        const { data: guardOk, error: guardError } = await supabase.rpc("guard_preflight_send", {
          p_account: accountId,
        });

        if (guardError) {
          throw new Error(`preflight_guard_failed:${guardError.message}`);
        }

        if (guardOk === false) {
          await supabase.from("followup_decisions").insert({
            thread_id: threadId,
            rule_id: ruleId,
            decision: "wait_resume",
            details: {
              reason: "preflight_block",
              account_id: accountId,
            },
          });

          return {
            decision: "wait_resume",
            ruleId,
            details: {
              reason: "preflight_block",
              account_id: accountId,
            },
          };
        }
      }

      let variantId = typeof action.variant_id === "string" ? action.variant_id : null;
      let variantLookupError: string | null = null;

      const { data: lastInbound, error: scenarioError } = await supabase
        .from("v_thread_last_inbound")
        .select("ai_label")
        .eq("thread_id", threadId)
        .maybeSingle();

      if (scenarioError) {
        throw new Error(`scenario_fetch_failed:${scenarioError.message}`);
      }

      const scenarioRaw = (lastInbound?.ai_label ?? "no_reply").toLowerCase();
      const scenario = scenarioRaw.replace(/[^a-z_]/g, "") || "no_reply";

      if (!variantId && action.variant_key) {
        const { data: variantRow, error: variantError } = await supabase
          .from("nudge_variants")
          .select("id")
          .eq("campaign_id", thread.campaign_id)
          .eq("name", action.variant_key)
          .maybeSingle();

        if (variantError) {
          variantLookupError = variantError.message;
        } else {
          variantId = variantRow?.id ?? null;
          if (!variantId) {
            variantLookupError = "variant_not_found";
          }
        }
      }

      if (!variantId) {
        const { data: pickedId, error: pickError } = await supabase.rpc("nudge_pick_variant", {
          p_campaign: thread.campaign_id,
          p_scenario: scenario,
        });

        if (pickError) {
          variantLookupError = `picker_error:${pickError.message}`;
        } else {
          variantId = typeof pickedId === "string" ? pickedId : (pickedId as { nudge_pick_variant?: string } | null)?.nudge_pick_variant ?? null;
        }
      }

      const priority = toNumber(action.priority, 0);
      const payloadDetails = { ...action };
      delete (payloadDetails as { variant_id?: unknown }).variant_id;
      delete (payloadDetails as { variant_key?: unknown }).variant_key;
      (payloadDetails as { scenario?: string }).scenario = scenario;

      const { data: sendQueueId, error: enqueueError } = await supabase.rpc("enqueue_followup_job", {
        p_campaign: thread.campaign_id,
        p_thread: threadId,
        p_lead: thread.lead_id,
        p_variant: variantId,
        p_scenario: scenario,
        p_not_before: notBefore,
        p_priority: priority,
        p_details: {
          ...payloadDetails,
          variant_key: action.variant_key ?? null,
          variant_lookup_error: variantLookupError,
        },
      });

      if (enqueueError) {
        await supabase.from("followup_decisions").insert({
          thread_id: threadId,
          rule_id: ruleId,
          decision: "stop",
          details: {
            error: enqueueError.message,
            action,
            stage: "enqueue_followup_job",
          },
        });
        throw new Error(`enqueue_failed:${enqueueError.message}`);
      }

      await supabase.from("followup_decisions").insert({
        thread_id: threadId,
        rule_id: ruleId,
        decision: "enqueue",
        details: {
          delay_hours: delayHours,
          delay_hours_base: baseDelayHours,
          resilience_mode: resilienceMode,
          not_before: notBefore,
          variant_id: variantId,
          scenario,
          variant_lookup_error: variantLookupError,
        },
      });

      return {
        decision: "enqueue",
        ruleId,
        sendQueueId: sendQueueId ?? null,
        details: {
          delay_hours: delayHours,
          delay_hours_base: baseDelayHours,
          resilience_mode: resilienceMode,
          not_before: notBefore,
          variant_id: variantId,
          scenario,
          variant_lookup_error: variantLookupError,
        },
      };
    }
    default: {
      await supabase.from("followup_decisions").insert({
        thread_id: threadId,
        rule_id: ruleId,
        decision: "stop",
        details: { reason: "unknown_action", action },
      });
      return { decision: "stop", ruleId, details: { reason: "unknown_action", action } };
    }
  }
}

