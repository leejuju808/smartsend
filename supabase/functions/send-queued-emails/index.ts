// Deno runtime
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "SmartSend <noreply@yourdomain.com>";
const BATCH_SIZE = Number(Deno.env.get("BATCH_SIZE") || 25);
const BASE_DELAY_MIN = 5;        // 5 minutes
const MAX_DELAY_MIN = 360;       // 6 hours cap

type QueueRow = {
  id: string;
  campaign_id?: string;
  lead_id?: string;
  org_id?: string;
  to_email: string;
  subject: string;
  body: string;
  status: "queued" | "retrying" | "sending" | "sent" | "failed";
  scheduled_at: string;
  next_attempt_at: string;
  retry_count: number;
  max_retries: number;
  workspace_id?: string;
  idempotency_key?: string;
  variant_key?: string | null;
  template_version_id?: string | null;
  user_id?: string;
};

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function checkDailyQuota(workspaceId: string, maxPerDay = 500) {
  const today = new Date().toISOString().split("T")[0];
  let { data: usage } = await sb
    .from("send_quota_usage")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("date", today)
    .single();

  if (!usage) {
    const { data: newRow } = await sb
      .from("send_quota_usage")
      .insert({ workspace_id: workspaceId, date: today, sent_count: 0 })
      .select()
      .single();
    usage = newRow;
  }

  if (usage.sent_count >= maxPerDay)
    throw new Error(`Daily quota (${maxPerDay}) reached.`);

  await sb
    .from("send_quota_usage")
    .update({ sent_count: usage.sent_count + 1 })
    .eq("id", usage.id);
}

function backoffMinutes(retryCount: number) {
  // exponential: 2^n * BASE_DELAY_MIN, capped
  const d = Math.min(Math.pow(2, retryCount) * BASE_DELAY_MIN, MAX_DELAY_MIN);
  return d;
}

async function fetchDue(): Promise<QueueRow[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("send_queue")
    .select("id, campaign_id, lead_id, org_id, workspace_id, to_email, subject, body_html, body, status, scheduled_at, next_attempt_at, retry_count, max_retries, idempotency_key, variant_key, template_version_id, user_id")
    .in("status", ["queued", "retrying"])
    .lte("scheduled_at", nowIso)
    .lte("next_attempt_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) throw error;
  
  // Map to QueueRow format - use body_html if body is missing
  return (data || []).map((row: any) => ({
    ...row,
    body: row.body || row.body_html || ""
  })) as QueueRow[];
}

async function markSending(id: string) {
  const { error } = await sb.from("send_queue").update({ status: "sending" }).eq("id", id);
  if (error) throw error;
}

async function setRetry(row: QueueRow, reason: string) {
  const nextRetry = row.retry_count + 1;
  const delayMin = backoffMinutes(row.retry_count);
  const nextAt = new Date(Date.now() + delayMin * 60_000).toISOString();

  const status = nextRetry > row.max_retries ? "failed" : "retrying";
  const { error } = await sb
    .from("send_queue")
    .update({
      status,
      retry_count: nextRetry,
      next_attempt_at: nextAt,
      error_text: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) throw error;

  await logEvent(row.id, row.to_email, status === "failed" ? "failed" : "failed", null, reason, {
    retry_scheduled_in_min: delayMin,
    next_attempt_at: nextAt,
    attempt_number: nextRetry,
  });

  // Log activity if failed
  if (status === "failed" && row.campaign_id) {
    try {
      await sb.from("activity_logs").insert({
        campaign_id: row.campaign_id,
        actor_id: null, // system
        lead_id: row.lead_id ?? null,
        event_type: "email_failed",
        meta: { queue_id: row.id, error: reason },
      });
    } catch (activityErr) {
      console.error("Failed to log activity:", activityErr);
      // Don't fail if activity logging fails
    }
  }
}

async function scheduleNextStep(job: QueueRow) {
  // Only process if this is a sequence step (has idempotency_key with step pattern)
  if (!job.idempotency_key || !job.campaign_id || !job.lead_id) {
    return;
  }

  const stepMatch = job.idempotency_key.match(/step(\d+)/);
  if (!stepMatch) {
    return; // Not a sequence step
  }

  const currentStepNum = parseInt(stepMatch[1], 10);

  try {
    // Mark current step as sent in lead_step_states
    await sb
      .from("lead_step_states")
      .update({ 
        state: "sent", 
        sent_at: new Date().toISOString() 
      })
      .eq("campaign_id", job.campaign_id)
      .eq("lead_id", job.lead_id)
      .eq("step_number", currentStepNum);

    // Check if lead has replied/unsubscribed/bounced
    const { data: leadRow } = await sb
      .from("leads")
      .select("status, unsubscribed_at, bounced_at")
      .eq("id", job.lead_id)
      .single();

    const stop = 
      leadRow?.status === "Replied" || 
      !!leadRow?.unsubscribed_at || 
      !!leadRow?.bounced_at;

    if (stop) {
      // Cancel remaining pending steps
      await sb
        .from("lead_step_states")
        .update({ 
          state: "canceled", 
          canceled_reason: "stop_condition" 
        })
        .eq("campaign_id", job.campaign_id)
        .eq("lead_id", job.lead_id)
        .eq("state", "pending");
      return;
    }

    // Get next step
    const { data: nextStep } = await sb
      .from("campaign_steps")
      .select("step_number, delay_days, subject, body")
      .eq("campaign_id", job.campaign_id)
      .eq("active", true)
      .gt("step_number", currentStepNum)
      .order("step_number", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!nextStep) {
      return; // No more steps
    }

    // Create or update lead_step_states for next step
    await sb
      .from("lead_step_states")
      .upsert({
        campaign_id: job.campaign_id,
        lead_id: job.lead_id,
        step_number: nextStep.step_number,
        state: "pending"
      }, {
        onConflict: "campaign_id,lead_id,step_number"
      });

    // Get lead/contact email for merge tags
    // Try contacts first, then leads table
    let lead: any = null;
    const { data: contact } = await sb
      .from("contacts")
      .select("email, first_name, last_name, company")
      .eq("id", job.lead_id)
      .maybeSingle();
    
    if (contact) {
      lead = contact;
    } else {
      // Fallback to leads table
      const { data: leadRow } = await sb
        .from("leads")
        .select("email, first_name, last_name, company")
        .eq("id", job.lead_id)
        .maybeSingle();
      
      if (leadRow) {
        lead = {
          email: leadRow.email,
          first_name: leadRow.first_name,
          last_name: leadRow.last_name,
          company: leadRow.company
        };
      }
    }

    if (!lead) {
      console.error(`Lead/contact ${job.lead_id} not found for next step`);
      return;
    }

    // Apply merge tags to next step template
    const mergeData = {
      first_name: lead.first_name || "",
      last_name: lead.last_name || "",
      company: lead.company || "",
      email: lead.email || ""
    };

    const subject = nextStep.subject.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      return mergeData[key as keyof typeof mergeData] || "";
    });

    const body = nextStep.body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      return mergeData[key as keyof typeof mergeData] || "";
    });

    // Calculate schedule time: now + delay_days
    const scheduleAt = new Date(
      Date.now() + nextStep.delay_days * 24 * 60 * 60 * 1000
    ).toISOString();

    // Create queue entry for next step
    const { data: q2, error: qErr } = await sb
      .from("send_queue")
      .insert({
        workspace_id: job.workspace_id,
        org_id: job.org_id,
        campaign_id: job.campaign_id,
        lead_id: job.lead_id,
        to_email: lead.email,
        subject,
        body_html: body,
        scheduled_at: scheduleAt,
        status: "queued",
        idempotency_key: `${job.campaign_id}:${job.lead_id}:step${nextStep.step_number}`
      })
      .select("id")
      .single();

    if (!qErr && q2?.id) {
      // Update lead_step_states to link queue_id
      await sb
        .from("lead_step_states")
        .update({ 
          state: "queued", 
          queue_id: q2.id 
        })
        .eq("campaign_id", job.campaign_id)
        .eq("lead_id", job.lead_id)
        .eq("step_number", nextStep.step_number);
    }
  } catch (err) {
    console.error("Error scheduling next step:", err);
    // Don't throw - we don't want to fail the main send if next step scheduling fails
  }
}

async function markSent(id: string, providerId?: string, job?: QueueRow) {
  // Fetch the queue row data to get variant info if not in job param
  let queueData = job;
  if (!queueData) {
    const { data: row } = await sb
      .from("send_queue")
      .select("variant_key, template_version_id, user_id, campaign_id, lead_id")
      .eq("id", id)
      .single();
    queueData = row as any;
  }

  const { error } = await sb
    .from("send_queue")
    .update({
      status: "sent",
      provider_status: "sent",
      ext_message_id: providerId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
  await logEvent(id, null, "sent", providerId ?? null, undefined, undefined, queueData?.variant_key, queueData?.template_version_id);
  
  // Log activity to unified activity_log
  if (job?.campaign_id) {
    try {
      // Get account_id and company_id
      let account_id: string | null = null;
      let company_id: string | null = null;
      
      if (job.campaign_id) {
        const { data: campaign } = await sb
          .from("campaigns")
          .select("account_id, workspace_id, org_id")
          .eq("id", job.campaign_id)
          .maybeSingle();
        account_id = campaign?.account_id || campaign?.workspace_id || campaign?.org_id || null;
      }
      
      if (job.lead_id) {
        const { data: lead } = await sb
          .from("leads")
          .select("company_id")
          .eq("id", job.lead_id)
          .maybeSingle();
        company_id = lead?.company_id || null;
      }
      
      if (account_id) {
        await sb.from("activity_log").insert({
          account_id,
          campaign_id: job.campaign_id,
          company_id,
          lead_id: job.lead_id ?? null,
          event_type: "email_sent",
          meta: { queue_id: id, provider_id: providerId ?? null, step: queueData?.variant_key ? undefined : null },
        });
      }
    } catch (activityErr) {
      console.error("Failed to log activity:", activityErr);
      // Don't fail the send if activity logging fails
    }
  }
  
  // Track usage for billing
  if (job?.campaign_id) {
    try {
      // Get team_id from campaign
      const { data: campaign } = await sb
        .from("campaigns")
        .select("team_id")
        .eq("id", job.campaign_id)
        .maybeSingle();
      
      if (campaign?.team_id) {
        await sb.from("usage_events").insert({
          team_id: campaign.team_id,
          metric: "send",
          quantity: 1
        });
      }
    } catch (usageErr) {
      console.error("Failed to track usage:", usageErr);
      // Don't fail the send if usage tracking fails
    }
  }
  
  // Legacy workspace-based usage tracking (keep for backwards compatibility)
  if (job?.workspace_id) {
    try {
      await sb.rpc("increment_usage", {
        p_workspace_id: job.workspace_id,
        p_metric: "emails_sent"
      });
    } catch (usageErr) {
      console.error("Failed to increment usage:", usageErr);
      // Don't fail the send if usage tracking fails
    }
  }
  
  // Schedule next step if this is part of a sequence
  if (job) {
    await scheduleNextStep(job);
  }
}

async function logEvent(queueId: string, toEmail: string | null, event: string, providerId?: string | null, err?: string, meta?: Record<string, unknown>, variantKey?: string | null, templateVersionId?: string | null) {
  // Fetch queue row to get campaign_id and variant info if not provided
  let variant_key = variantKey;
  let template_version_id = templateVersionId;
  let campaign_id: string | undefined;
  
  if (!variant_key || !template_version_id) {
    const { data: queueRow } = await sb
      .from("send_queue")
      .select("variant_key, template_version_id, campaign_id")
      .eq("id", queueId)
      .single();
    if (queueRow) {
      variant_key = variant_key ?? queueRow.variant_key ?? null;
      template_version_id = template_version_id ?? queueRow.template_version_id ?? null;
      campaign_id = queueRow.campaign_id;
    }
  }

  await sb.from("send_logs").insert({
    queue_id: queueId,
    to_email: toEmail,
    provider_id: providerId ?? null,
    status: event,
    event,
    error_text: err ?? null,
    meta: meta ? meta as any : null,
    variant_key: variant_key ?? null,
    template_version_id: template_version_id ?? null,
    campaign_id: campaign_id ?? null,
  });
}

async function sendWithResend(to: string, subject: string, textBody: string, queueId: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      text: textBody,
      tags: [{ name: "queue_id", value: queueId }],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Resend error: ${res.status}`);
  }
  return data?.id as string | undefined;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const triggerToken = Deno.env.get("TRIGGER_TOKEN");
    if (triggerToken && token !== triggerToken) return new Response("Unauthorized", { status: 401 });

    const due = await fetchDue();

    for (const row of due) {
      try {
        // Check daily quota before sending
        await checkDailyQuota(row.workspace_id ?? "default", 500);
        
        await markSending(row.id);
        const providerId = await sendWithResend(row.to_email, row.subject, row.body, row.id);
        await markSent(row.id, providerId, row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await setRetry(row, msg);
      }
    }

    return Response.json({ ok: true, processed: due.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }
});