import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type IntentLabel =
  | "not_interested"
  | "unsubscribe"
  | "needs_info"
  | "follow_up_later"
  | "open_to_chat"
  | "ready_to_meet"
  | "referral"
  | "out_of_office"
  | "unclear";

interface PlaybookRule {
  id: string;
  org_id: string | null;
  intent_label: string;
  pipeline_stage: string;
  delay_minutes: number;
  template_key: string;
  stop_outreach: boolean;
  update_pipeline_stage: string | null;
}

type GuardrailCheckResult = {
  allowed: boolean;
  reason?: string;
};

// Small helper to grab the domain part of an email
function extractDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  return parts[1].toLowerCase();
}

// Merge sequence-level overrides with global settings
function mergeSequenceOverrides(globalSettings: any, seqOverride: any | null) {
  if (!seqOverride) return globalSettings;
  const clone = { ...globalSettings };
  const map: Record<string, string> = {
    autopilot_mode_override: "autopilot_mode",
    aggressiveness_override: "aggressiveness",
    max_autopilot_emails_per_lead_override: "max_autopilot_emails_per_lead",
    min_minutes_between_autopilot_override: "min_minutes_between_autopilot",
    auto_send_ready_to_meet_override: "auto_send_ready_to_meet",
    auto_send_needs_info_override: "auto_send_needs_info",
    auto_send_follow_up_later_override: "auto_send_follow_up_later",
    auto_send_open_to_chat_override: "auto_send_open_to_chat",
  };
  for (const [overrideKey, targetKey] of Object.entries(map)) {
    const value = (seqOverride as any)[overrideKey];
    if (value !== null && value !== undefined) {
      (clone as any)[targetKey] = value;
    }
  }
  return clone;
}

async function checkGuardrails({
  supabase,
  lead,
  settings,
}: {
  supabase: any;
  lead: any;
  settings: any;
}): Promise<GuardrailCheckResult> {
  const orgId = lead.org_id || null;

  // 1) Global lock
  if (settings.autopilot_locked) {
    await supabase.from("sdr_guardrail_events").insert({
      org_id: orgId,
      lead_id: lead.id,
      email_domain: extractDomain(lead.email),
      guardrail_type: "autopilot_locked",
      message: "Autopilot is locked for this org",
      context: {
        reason: settings.autopilot_locked_reason,
      },
    });

    return { allowed: false, reason: "autopilot_locked" };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();

  const domain = extractDomain(lead.email);

  // 2) Org daily cap
  if (orgId) {
    // Get all AI SDR sends for this org today by checking leads
    const { data: orgLeads } = await supabase
      .from("leads")
      .select("id")
      .eq("org_id", orgId);

    const leadIds = orgLeads?.map((l: any) => l.id) || [];

    if (leadIds.length > 0) {
      const { count: orgCountFinal, error: orgErrFinal } = await supabase
        .from("send_queue")
        .select("id", { count: "exact", head: true })
        .eq("source", "ai_sdr")
        .eq("status", "sent")
        .gte("created_at", todayStartIso)
        .in("lead_id", leadIds);

      const usedOrg = orgErrFinal ? 0 : orgCountFinal ?? 0;
      if (usedOrg >= settings.daily_ai_sdr_cap_per_org) {
        await supabase.from("sdr_guardrail_events").insert({
          org_id: orgId,
          lead_id: lead.id,
          email_domain: domain,
          guardrail_type: "org_daily_cap",
          message: "Org daily AI SDR cap reached",
          context: {
            used: usedOrg,
            limit: settings.daily_ai_sdr_cap_per_org,
          },
        });

        return { allowed: false, reason: "org_daily_cap_reached" };
      }
    }
  }

  // 3) Lead daily cap
  {
    const { count: leadCount, error: leadErr } = await supabase
      .from("send_queue")
      .select("id", { count: "exact", head: true })
      .eq("source", "ai_sdr")
      .eq("status", "sent")
      .eq("lead_id", lead.id)
      .gte("created_at", todayStartIso);

    const usedLead = leadErr ? 0 : leadCount ?? 0;
    if (usedLead >= settings.daily_ai_sdr_cap_per_lead) {
      await supabase.from("sdr_guardrail_events").insert({
        org_id: orgId,
        lead_id: lead.id,
        email_domain: domain,
        guardrail_type: "lead_daily_cap",
        message: "Lead daily AI SDR cap reached",
        context: {
          used: usedLead,
          limit: settings.daily_ai_sdr_cap_per_lead,
        },
      });

      return { allowed: false, reason: "lead_daily_cap_reached" };
    }
  }

  // 4) Domain daily cap
  if (domain) {
    // Get all leads with this email domain for the org
    const { data: domainLeads } = await supabase
      .from("leads")
      .select("id")
      .ilike("email", `%@${domain}`)
      .eq("org_id", orgId);

    const domainLeadIds = domainLeads?.map((l: any) => l.id) || [];

    if (domainLeadIds.length > 0) {
      const { count: domainCount, error: domainErr } = await supabase
        .from("send_queue")
        .select("id", { count: "exact", head: true })
        .eq("source", "ai_sdr")
        .eq("status", "sent")
        .gte("created_at", todayStartIso)
        .in("lead_id", domainLeadIds);

      const usedDomain = domainErr ? 0 : domainCount ?? 0;
      if (usedDomain >= settings.daily_ai_sdr_cap_per_domain) {
        await supabase.from("sdr_guardrail_events").insert({
          org_id: orgId,
          lead_id: lead.id,
          email_domain: domain,
          guardrail_type: "domain_daily_cap",
          message: "Domain daily AI SDR cap reached",
          context: {
            used: usedDomain,
            limit: settings.daily_ai_sdr_cap_per_domain,
          },
        });

        return { allowed: false, reason: "domain_daily_cap_reached" };
      }
    }
  }

  return { allowed: true };
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { reply_id } = await req.json();
    if (!reply_id) {
      return new Response(
        JSON.stringify({ error: "reply_id is required" }),
        { status: 400 },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1) Pull reply with intent + lead link
    const { data: reply, error: replyError } = await supabase
      .from("lead_replies")
      .select("id, lead_id, body_text, subject, intent_label, intent_confidence")
      .eq("id", reply_id)
      .single();

    if (replyError || !reply) {
      return new Response(
        JSON.stringify({ error: "Reply not found", details: replyError }),
        { status: 404 },
      );
    }

    if (!reply.intent_label) {
      return new Response(
        JSON.stringify({
          error: "No intent_label on reply; run meeting-intent-extractor first",
        }),
        { status: 400 },
      );
    }

    // 2) Pull lead for context (pipeline_stage + org_id + persona)
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select(
        "id, email, first_name, last_name, pipeline_stage, do_not_contact, org_id, ai_sdr_opt_out, ai_sdr_opt_out_reason, ai_sdr_opt_out_at, ai_persona_id",
      )
      .eq("id", reply.lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found", details: leadError }),
        { status: 404 },
      );
    }

    if (lead.do_not_contact) {
      return new Response(
        JSON.stringify({ action: "skipped", reason: "do_not_contact" }),
        { status: 200 },
      );
    }

    // 2.0.5) Lead-level AI SDR kill switch
    if (lead.ai_sdr_opt_out) {
      // Log to guardrail events for visibility
      await supabase.from("sdr_guardrail_events").insert({
        org_id: lead.org_id || null,
        lead_id: lead.id,
        email_domain: extractDomain(lead.email),
        guardrail_type: "lead_opt_out",
        message: "Lead has AI SDR opt-out enabled",
        context: {
          reason: lead.ai_sdr_opt_out_reason || null,
          opt_out_at: lead.ai_sdr_opt_out_at || null,
        },
      });

      const pipelineStage: string = lead.pipeline_stage || "new";
      const intentLabel: string = reply.intent_label;

      return new Response(
        JSON.stringify({
          action: "none",
          reason: "lead_ai_sdr_opt_out",
          intent_label: intentLabel,
          pipeline_stage: pipelineStage,
        }),
        { status: 200 },
      );
    }

    // 2.1) Load SDR settings (org or fallback)
    const orgId = lead.org_id || null;
    let settings: any = null;
    if (orgId) {
      const { data, error } = await supabase
        .from("sdr_settings")
        .select("*")
        .eq("org_id", orgId)
        .maybeSingle();
      if (!error && data) settings = data;
    }

    // Fallback defaults if no row
    if (!settings) {
      settings = {
        autopilot_mode: "assist",
        aggressiveness: 2,
        max_autopilot_emails_per_lead: 5,
        min_minutes_between_autopilot: 480,
        send_window_start_hour: 8,
        send_window_end_hour: 17,
        weekdays_only: true,
        auto_send_ready_to_meet: true,
        auto_send_needs_info: true,
        auto_send_follow_up_later: true,
        auto_send_open_to_chat: true,
        daily_ai_sdr_cap_per_org: 500,
        daily_ai_sdr_cap_per_lead: 5,
        daily_ai_sdr_cap_per_domain: 100,
        autopilot_locked: false,
        autopilot_locked_reason: null,
        autopilot_locked_at: null,
      };
    }

    // 2.2) Load sequence-level override (if lead is enrolled in a sequence)
    let effectiveSettings = settings;
    let sequenceId: string | null = null;

    // Try to find sequence_id from sequence_enrollments
    if (orgId) {
      // First try: direct sequence_id in sequence_enrollments
      const { data: seqEnrollment } = await supabase
        .from("sequence_enrollments")
        .select("sequence_id")
        .eq("lead_id", lead.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (seqEnrollment?.sequence_id) {
        sequenceId = seqEnrollment.sequence_id;
      } else {
        // Fallback: try via campaign_id -> campaigns.sequence_id
        const { data: campaignEnrollment } = await supabase
          .from("sequence_enrollments")
          .select("campaign_id")
          .eq("lead_id", lead.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (campaignEnrollment?.campaign_id) {
          const { data: campaign } = await supabase
            .from("campaigns")
            .select("sequence_id")
            .eq("id", campaignEnrollment.campaign_id)
            .maybeSingle();

          if (campaign?.sequence_id) {
            sequenceId = campaign.sequence_id;
          }
        }
      }

      // Load sequence override if we found a sequence_id
      if (sequenceId) {
        const { data: seqOverride, error: seqErr } = await supabase
          .from("sdr_sequence_overrides")
          .select("*")
          .eq("org_id", orgId)
          .eq("sequence_id", sequenceId)
          .maybeSingle();

        if (!seqErr && seqOverride) {
          effectiveSettings = mergeSequenceOverrides(settings, seqOverride);
        }
      }
    }

    const pipelineStage: string = lead.pipeline_stage || "new";
    const intentLabel: string = reply.intent_label;

    // 3) Find best matching playbook rule
    let rule: PlaybookRule | null = null;

    // Try exact match with org + stage
    {
      const { data, error } = await supabase
        .from("sdr_playbook_rules")
        .select("*")
        .eq("intent_label", intentLabel)
        .eq("pipeline_stage", pipelineStage)
        .eq("org_id", lead.org_id || null)
        .maybeSingle();

      if (error) {
        console.warn("Error fetching exact org+stage rule", error);
      }
      if (data) rule = data as PlaybookRule;
    }

    // Fallback: org-specific, pipeline_stage = 'any'
    if (!rule && lead.org_id) {
      const { data, error } = await supabase
        .from("sdr_playbook_rules")
        .select("*")
        .eq("intent_label", intentLabel)
        .eq("pipeline_stage", "any")
        .eq("org_id", lead.org_id)
        .maybeSingle();

      if (error) {
        console.warn("Error fetching org any-stage rule", error);
      }
      if (data) rule = data as PlaybookRule;
    }

    // Fallback: global (org_id null) + exact stage
    if (!rule) {
      const { data, error } = await supabase
        .from("sdr_playbook_rules")
        .select("*")
        .eq("intent_label", intentLabel)
        .eq("pipeline_stage", pipelineStage)
        .is("org_id", null)
        .maybeSingle();

      if (error) {
        console.warn("Error fetching global stage rule", error);
      }
      if (data) rule = data as PlaybookRule;
    }

    // Fallback: global (org_id null) + 'any'
    if (!rule) {
      const { data, error } = await supabase
        .from("sdr_playbook_rules")
        .select("*")
        .eq("intent_label", intentLabel)
        .eq("pipeline_stage", "any")
        .is("org_id", null)
        .maybeSingle();

      if (error) {
        console.warn("Error fetching global any rule", error);
      }
      if (data) rule = data as PlaybookRule;
    }

    if (!rule) {
      return new Response(
        JSON.stringify({
          action: "none",
          reason: "no_matching_rule",
          intent_label: intentLabel,
          pipeline_stage: pipelineStage,
        }),
        { status: 200 },
      );
    }

    // Guardrail check before we even build a follow-up
    const guardrailResult = await checkGuardrails({
      supabase,
      lead,
      settings: effectiveSettings,
    });

    if (!guardrailResult.allowed) {
      return new Response(
        JSON.stringify({
          action: "none",
          reason: guardrailResult.reason || "guardrail_blocked",
          intent_label: intentLabel,
          pipeline_stage: pipelineStage,
        }),
        { status: 200 },
      );
    }

    // 4.5) Respect autopilot_mode + intent-specific toggles
    if (effectiveSettings.autopilot_mode === "off") {
      return new Response(
        JSON.stringify({
          action: "none",
          reason: "autopilot_off",
          intent_label: intentLabel,
          pipeline_stage: pipelineStage,
        }),
        { status: 200 },
      );
    }

    // per-intent toggles
    const intentToggleMap: Record<string, boolean> = {
      ready_to_meet: effectiveSettings.auto_send_ready_to_meet,
      needs_info: effectiveSettings.auto_send_needs_info,
      follow_up_later: effectiveSettings.auto_send_follow_up_later,
      open_to_chat: effectiveSettings.auto_send_open_to_chat,
    };

    if (
      intentLabel in intentToggleMap &&
      intentToggleMap[intentLabel] === false
    ) {
      return new Response(
        JSON.stringify({
          action: "none",
          reason: "intent_not_allowed_for_autopilot",
          intent_label: intentLabel,
          pipeline_stage: pipelineStage,
        }),
        { status: 200 },
      );
    }

    // 4) If rule stops outreach: mark lead & exit
    if (rule.stop_outreach) {
      const updates: Record<string, unknown> = {
        do_not_contact: true,
      };
      if (rule.update_pipeline_stage) {
        updates["pipeline_stage"] = rule.update_pipeline_stage;
      }

      const { error: leadUpdateError } = await supabase
        .from("leads")
        .update(updates)
        .eq("id", lead.id);

      if (leadUpdateError) {
        return new Response(
          JSON.stringify({
            error: "Failed to update lead for stop_outreach",
            details: leadUpdateError,
          }),
          { status: 500 },
        );
      }

      // Log stop_outreach event
      await supabase.from("lead_activity_events").insert({
        lead_id: lead.id,
        event_type: "stop_outreach",
        source: "ai_sdr",
        related_table: "leads",
        related_id: lead.id,
        payload: {
          rule_id: rule.id,
          intent_label: intentLabel,
          pipeline_stage: pipelineStage,
        },
      });

      return new Response(
        JSON.stringify({
          action: "stop_outreach",
          rule_id: rule.id,
          intent_label: intentLabel,
        }),
        { status: 200 },
      );
    }

    // 5) Enforce per-lead limits
    const { count: aiSentCount } = await supabase
      .from("send_queue")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", lead.id)
      .eq("source", "ai_sdr");

    if ((aiSentCount || 0) >= effectiveSettings.max_autopilot_emails_per_lead) {
      return new Response(
        JSON.stringify({
          action: "none",
          reason: "max_autopilot_emails_per_lead_reached",
          max: effectiveSettings.max_autopilot_emails_per_lead,
        }),
        { status: 200 },
      );
    }

    // Enforce min_minutes_between_autopilot
    const { data: lastAiSend } = await supabase
      .from("send_queue")
      .select("created_at")
      .eq("lead_id", lead.id)
      .eq("source", "ai_sdr")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastAiSend?.created_at) {
      const last = new Date(lastAiSend.created_at).getTime();
      const diffMinutes = (Date.now() - last) / (60 * 1000);
      if (diffMinutes < effectiveSettings.min_minutes_between_autopilot) {
        return new Response(
          JSON.stringify({
            action: "none",
            reason: "min_spacing_not_respected",
            min_minutes_between_autopilot: effectiveSettings.min_minutes_between_autopilot,
          }),
          { status: 200 },
        );
      }
    }

    // 6) Build follow-up email from template_key
    const { subject, body } = await buildEmailFromTemplate({
      templateKey: rule.template_key,
      lead,
      reply,
      rule,
    });

    // 7) Calculate scheduled_at, scaled by aggressiveness
    let delayMinutes = rule.delay_minutes;

    if (effectiveSettings.aggressiveness === 1) {
      delayMinutes = Math.round(delayMinutes * 1.5); // slower
    } else if (effectiveSettings.aggressiveness === 3) {
      delayMinutes = Math.round(delayMinutes * 0.6); // faster
      if (delayMinutes < 5) delayMinutes = 5; // keep some floor
    }

    const scheduledAt = new Date(
      Date.now() + delayMinutes * 60 * 1000,
    ).toISOString();

    // Decide review_status based on autopilot_mode
    let reviewStatus: string = "approved";

    if (effectiveSettings.autopilot_mode === "assist") {
      reviewStatus = "pending_review";
    } else if (effectiveSettings.autopilot_mode === "auto") {
      reviewStatus = "approved";
    }

    // 8) Insert into AI SDR queue
    const { error: queueError } = await supabase
      .from("sdr_autopilot_queue")
      .insert({
        lead_id: lead.id,
        reply_id: reply.id,
        rule_id: rule.id,
        channel: "email",
        template_key: rule.template_key,
        subject,
        body,
        scheduled_at: scheduledAt,
        status: "pending",
        review_status: reviewStatus,
        edited_subject: null,
        edited_body: null,
      });

    if (queueError) {
      return new Response(
        JSON.stringify({
          error: "Failed to insert into sdr_autopilot_queue",
          details: queueError,
        }),
        { status: 500 },
      );
    }

    // Log autopilot_queued event
    const { data: lastJob } = await supabase
      .from("sdr_autopilot_queue")
      .select("id")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastJob?.id) {
      const { error: activityError } = await supabase
        .from("lead_activity_events")
        .insert({
          lead_id: lead.id,
          event_type: "autopilot_queued",
          source: "ai_sdr",
          related_table: "sdr_autopilot_queue",
          related_id: lastJob.id,
          payload: {
            rule_id: rule.id,
            template_key: rule.template_key,
            scheduled_at: scheduledAt,
            intent_label: intentLabel,
            pipeline_stage: pipelineStage,
          },
        });

      if (activityError) {
        console.error("Failed to insert autopilot_queued activity", activityError);
      }
    }

    return new Response(
      JSON.stringify({
        action: "queued_followup",
        rule_id: rule.id,
        scheduled_at: scheduledAt,
        template_key: rule.template_key,
      }),
      { status: 200 },
    );
  } catch (err) {
    console.error("ai-sdr-autopilot error", err);
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: String(err) }),
      { status: 500 },
    );
  }
});

/**
 * Build email from template with AI rewriting support.
 * Falls back to legacy static templates if AI is disabled or fails.
 */
async function buildEmailFromTemplate({
  templateKey,
  lead,
  reply,
  rule,
}: {
  templateKey: string;
  lead: any;
  reply: any;
  rule: any;
}): Promise<{ subject: string; body: string }> {
  const useAi =
    Deno.env.get("AI_TEMPLATE_REWRITER_ENABLED") === "true";

  const defaultSubject = reply?.subject
    ? `Re: ${reply.subject}`
    : "Quick follow-up";

  const defaultBody = [
    `Hey ${(lead.first_name || "").trim() || "there"},`,
    "",
    `Just following up on my last note.`,
    "",
    `Best,`,
    `{{SENDER_NAME}}`,
  ].join("\n");

  if (!useAi) {
    // old-school fallback, same as before
    return legacyStaticTemplate({ templateKey, lead, reply, defaultSubject, defaultBody });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const res = await fetch(
      `${supabaseUrl}/functions/v1/ai-template-rewriter`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          lead_id: lead.id,
          reply_id: reply?.id || null,
          template_key: templateKey,
          org_id: lead.org_id || null,
          default_subject: defaultSubject,
          default_body: defaultBody,
          product_name: Deno.env.get("PRODUCT_NAME") || "SmartSend",
          value_prop:
            Deno.env.get("PRODUCT_VALUE_PROP") ||
            "automating your cold email follow-ups with AI",
          sender_name: Deno.env.get("DEFAULT_SENDER_NAME") || "The SmartSend team",
          sender_role: Deno.env.get("DEFAULT_SENDER_ROLE") || "Founder",
          sender_company: Deno.env.get("DEFAULT_SENDER_COMPANY") || "SmartSend",
        }),
      },
    );

    if (!res.ok) {
      console.error("ai-template-rewriter HTTP error", await res.text());
      return legacyStaticTemplate({
        templateKey,
        lead,
        reply,
        defaultSubject,
        defaultBody,
      });
    }

    const json = await res.json();
    return {
      subject: json.subject || defaultSubject,
      body: json.body || defaultBody,
    };
  } catch (e) {
    console.error("ai-template-rewriter call failed", e);
    return legacyStaticTemplate({
      templateKey,
      lead,
      reply,
      defaultSubject,
      defaultBody,
    });
  }
}

/**
 * Legacy static template generator (fallback when AI is disabled or fails).
 */
function legacyStaticTemplate({
  templateKey,
  lead,
  reply,
  defaultSubject,
  defaultBody,
}: {
  templateKey: string;
  lead: any;
  reply: any;
  defaultSubject: string;
  defaultBody: string;
}): { subject: string; body: string } {
  const firstName =
    (lead.first_name || "").trim() ||
    (lead.last_name ? `there` : "there");

  switch (templateKey) {
    case "answer_questions": {
      const subject = `Re: ${reply.subject || "your questions"}`;
      const body = [
        `Hey ${firstName},`,
        ``,
        `Appreciate the thoughtful questions — quick answers inline below 👇`,
        ``,
        `> ${truncate(reply.body_text || "", 280)}`,
        ``,
        `I dropped quick answers to each point here, and if it's helpful I can also walk you through it live in a 15–20 minute call.`,
        ``,
        `Would a quick walkthrough sometime this week be useful?`,
        ``,
        `Best,`,
        `{{SENDER_NAME}}`,
      ].join("\n");
      return { subject, body };
    }

    case "check_back_later": {
      const subject = `Quick check-in`;
      const body = [
        `Hey ${firstName},`,
        ``,
        `Last time we spoke, timing wasn't ideal — totally get it.`,
        ``,
        `Just checking back in like we discussed to see if it makes sense to revisit how {{PRODUCT}} can help you with {{VALUE_PROP}}.`,
        ``,
        `If it's still not a priority, no worries at all — just let me know and I'll close the loop on my side.`,
        ``,
        `Best,`,
        `{{SENDER_NAME}}`,
      ].join("\n");
      return { subject, body };
    }

    case "nudge_to_meeting": {
      const subject = `Worth a quick 15-min chat?`;
      const body = [
        `Hey ${firstName},`,
        ``,
        `Appreciate you being open to the idea.`,
        ``,
        `Rather than a long email chain, how about a quick 15–20 minute call where I can show you exactly how {{PRODUCT}} is working for teams like yours and answer anything on the spot?`,
        ``,
        `Totally fine if now isn't the right time — just wanted to make it easy if it is.`,
        ``,
        `Best,`,
        `{{SENDER_NAME}}`,
      ].join("\n");
      return { subject, body };
    }

    case "confirm_meeting": {
      const subject = `Re: scheduling time`;
      const meetingSlots = Array.isArray(reply?.suggested_meeting_times)
        ? reply.suggested_meeting_times
            .slice(0, 3)
            .map((slot: any) => `• ${slot.note || slot.time || slot}`)
            .join("\n")
        : `• {{SLOT_1}}\n• {{SLOT_2}}\n• {{SLOT_3}}`;
      const body = [
        `Hey ${firstName},`,
        ``,
        `Love that you're up for a call — happy to dive in.`,
        ``,
        `Here are a few times that usually work on my side:`,
        meetingSlots,
        ``,
        `If any of those are close, I can adjust, or feel free to send over a couple windows that work for you and I'll lock one in.`,
        ``,
        `Looking forward to it,`,
        `{{SENDER_NAME}}`,
      ].join("\n");
      return { subject, body };
    }

    case "referral_followup": {
      const subject = `Intro based on your referral`;
      const body = [
        `Hey ${firstName},`,
        ``,
        `Thanks again for pointing me to the right person — appreciate the help.`,
        ``,
        `I'll reach out to them with context and keep this super relevant to {{COMPANY}} so it's worth their time.`,
        ``,
        `If there's anything specific you think I should mention (or avoid), just reply to this email and I'll make sure to incorporate it.`,
        ``,
        `Best,`,
        `{{SENDER_NAME}}`,
      ].join("\n");
      return { subject, body };
    }

    case "after_ooo_followup": {
      const subject = `Welcome back (quick follow-up)`;
      const body = [
        `Hey ${firstName},`,
        ``,
        `Hope you had a smooth return — looping back on my last note since I caught an out-of-office reply before.`,
        ``,
        `Very quick version: {{ONE_LINE_PITCH}}`,
        ``,
        `If you'd like, I can send over a 2–3 sentence summary of what this could look like specifically for {{COMPANY}} or we can jump on a short call.`,
        ``,
        `Best,`,
        `{{SENDER_NAME}}`,
      ].join("\n");
      return { subject, body };
    }

    case "unsubscribe_ack": {
      const subject = `You're all set — removed from our list`;
      const body = [
        `Hey ${firstName},`,
        ``,
        `Got it — I've removed you from future emails.`,
        ``,
        `Wishing you and the team all the best,`,
        `{{SENDER_NAME}}`,
      ].join("\n");
      return { subject, body };
    }

    case "no_followup":
    default: {
      const subject = reply.subject || "Re: your note";
      const body = [
        `Hey ${firstName},`,
        ``,
        `Thanks for letting me know — I'll close the loop on my side.`,
        ``,
        `All the best,`,
        `{{SENDER_NAME}}`,
      ].join("\n");
      return { subject, body };
    }
  }
}

function truncate(text: string, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}
