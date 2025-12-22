// supabase/functions/process-send-queue/index.ts
// Blocks 8110 + 8120 + 8150 — Queue Processor + Event Log + Provider-aware stubs

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import {
  renderTemplateString,
  enforceAuthorityHtml,
  enforceAuthorityText,
  appendComplianceFooterHtml,
  appendComplianceFooterText,
  checkCopyOrThrow,
} from "./render-template.ts";

type QueueJob = {
  id: string;
  campaign_id: string;
  lead_id: string | null;
  workspace_id?: string;
  to_email: string;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  provider: string | null;
  provider_account_id: string | null;
  from_email: string | null;
  attempts: number;
  max_attempts: number;
  contact_id?: string | null;
  step_no?: number | null;
};

type OutboundEmailAccount = {
  id: string;
  org_id: string | null;
  user_id: string | null;
  provider: "gmail" | "outlook" | "smtp";
  display_name: string | null;
  from_email: string;
  status: "connected" | "revoked" | "error";
  daily_limit: number | null;
  used_today: number;
  last_reset_at: string | null;
  metadata: Record<string, unknown>;
};

const BATCH_SIZE = 25;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Simple in-memory cache for providers during this invocation
const accountCache = new Map<string, OutboundEmailAccount>();
const workspaceFollowupCapCache = new Map<string, number>();

async function getAccountForJob(job: QueueJob): Promise<OutboundEmailAccount | null> {
  if (!job.provider_account_id) return null;

  const cached = accountCache.get(job.provider_account_id);
  if (cached) return cached;

  const { data, error } = await supabaseAdmin
    .from("outbound_email_accounts")
    .select("*")
    .eq("id", job.provider_account_id)
    .maybeSingle<OutboundEmailAccount>();

  if (error) {
    console.error("Error fetching outbound_email_accounts:", error);
    return null;
  }

  if (!data) return null;

  accountCache.set(job.provider_account_id, data);
  return data;
}

async function sendViaGmailStub(job: QueueJob, account: OutboundEmailAccount) {
  console.log(
    "[GMAIL STUB] sending",
    {
      from: account.from_email,
      to: job.to_email,
      subject: job.subject,
    },
  );

  // simulate IO latency
  await new Promise((resolve) => setTimeout(resolve, 50));

  return {
    ok: true,
    provider: "gmail" as const,
    providerMessageId: `gmail-stub-${job.id}-${Date.now()}`,
  };
}

async function sendViaOutlookStub(job: QueueJob, account: OutboundEmailAccount) {
  console.log(
    "[OUTLOOK STUB] sending",
    {
      from: account.from_email,
      to: job.to_email,
      subject: job.subject,
    },
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

  return {
    ok: true,
    provider: "outlook" as const,
    providerMessageId: `outlook-stub-${job.id}-${Date.now()}`,
  };
}

async function sendViaSmtpStub(job: QueueJob, account: OutboundEmailAccount) {
  console.log(
    "[SMTP STUB] sending",
    {
      from: account.from_email,
      to: job.to_email,
      subject: job.subject,
    },
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

  return {
    ok: true,
    provider: "smtp" as const,
    providerMessageId: `smtp-stub-${job.id}-${Date.now()}`,
  };
}

/**
 * Get personalization for a contact and step
 * Generates personalized content using OpenAI or returns cached result
 */
async function getPersonalization(
  contactId: string | null,
  campaignId: string,
  stepNo: number | null
): Promise<{ opener: string; local_reference: string; roof_context: string } | null> {
  if (!contactId || !stepNo) {
    return null;
  }

  try {
    // Get step_id from campaign_steps using campaign_id + step_no
    const { data: step, error: stepError } = await supabaseAdmin
      .from("campaign_steps")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("step_no", stepNo)
      .maybeSingle();

    if (stepError || !step) {
      console.log("Step not found for personalization", { campaignId, stepNo });
      return null;
    }

    // Check cache first
    const { data: cached } = await supabaseAdmin
      .from("personalization_cache")
      .select("opener, local_reference, roof_context")
      .eq("contact_id", contactId)
      .eq("step_id", step.id)
      .maybeSingle();

    if (cached) {
      return {
        opener: cached.opener,
        local_reference: cached.local_reference,
        roof_context: cached.roof_context,
      };
    }

    // Get contact data
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("first_name, tags, attrs")
      .eq("id", contactId)
      .maybeSingle();

    if (!contact) {
      return null;
    }

    // Get campaign type
    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("type")
      .eq("id", campaignId)
      .maybeSingle();

    let campaignType = "general";
    if (campaign?.type && ["hail", "storm", "inspection", "insurance"].includes(campaign.type.toLowerCase())) {
      campaignType = campaign.type.toLowerCase();
    }

    // Get user settings for tone
    const { data: workspace } = await supabaseAdmin
      .from("campaigns")
      .select("workspace_id")
      .eq("id", campaignId)
      .maybeSingle();

    let tone = "direct";
    if (workspace?.workspace_id) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("workspace_id", workspace.workspace_id)
        .maybeSingle();

      if (profile?.id) {
        const { data: settings } = await supabaseAdmin
          .from("personalization_settings")
          .select("tone, enabled")
          .eq("user_id", profile.id)
          .maybeSingle();

        if (settings?.enabled && settings.tone) {
          tone = settings.tone;
        }
      }
    }

    // Generate personalization using OpenAI
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY not configured");
      return null;
    }

    const attrs = (contact.attrs as Record<string, any>) || {};
    const locationParts: string[] = [];
    if (attrs.city) locationParts.push(attrs.city);
    if (attrs.state) locationParts.push(attrs.state);
    const location = locationParts.length > 0 ? locationParts.join(", ") : null;

    const tags = contact.tags || [];
    const hasHail = tags.some((t: string) => t.toLowerCase().includes("hail"));
    const hasStorm = tags.some((t: string) => t.toLowerCase().includes("storm"));

    let finalCampaignType = campaignType;
    if (finalCampaignType === "general" && hasHail) finalCampaignType = "hail";
    if (finalCampaignType === "general" && hasStorm) finalCampaignType = "storm";

    const systemPrompt = `You are a roofing contractor email personalization assistant. 
Generate hyper-personalized, natural-sounding content for cold outreach emails.

Guidelines:
- Sound like a local roofer who knows the area
- Be direct and confident, no fluff
- Use contractor-friendly language ("We do free inspections", "We're in your area this week")
- Keep openers to 1-2 sentences max
- Keep local references and roof context to 1 sentence each
- Avoid generic phrases
- Don't make up specific storm dates or events unless context suggests it
- If location info is missing, use general but still personal language

Tone: ${tone === "friendly" ? "Warm and approachable" : tone === "professional" ? "Professional and polished" : "Direct and confident"}`;

    const userPrompt = `Generate personalized content for a roofing outreach email.

Contact Info:
${contact.first_name ? `Name: ${contact.first_name}` : "Name: Not provided"}
${location ? `Location: ${location}` : "Location: Not provided"}
${attrs.zip ? `ZIP: ${attrs.zip}` : "ZIP: Not provided"}
${tags.length > 0 ? `Tags: ${tags.join(", ")}` : "Tags: None"}
Campaign Type: ${finalCampaignType}

Generate three pieces of content:

1. **Opener** (1-2 sentences): A personalized opening that references:
   - Location (if available): mention city/area, recent weather patterns, local roofing issues
   - Campaign context: ${finalCampaignType === "hail" ? "hail damage" : finalCampaignType === "storm" ? "storm damage" : finalCampaignType === "inspection" ? "roof inspection needs" : finalCampaignType === "insurance" ? "insurance claims" : "roofing needs"}
   - Make it feel like you know their neighborhood

2. **Local Reference** (1 sentence): A short sentence that:
   - Mentions working in their area/neighborhood
   - References local context (storms, weather patterns, common roofing issues)
   - Sounds natural and local

3. **Roof Context** (1 sentence): A sentence about:
   - Common roofing issues for their situation
   - What you typically see in inspections
   - Relevant to their tags/campaign type

Return ONLY valid JSON in this exact format:
{
  "opener": "...",
  "local_reference": "...",
  "roof_context": "..."
}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      return null;
    }

    const parsed = JSON.parse(content) as { opener: string; local_reference: string; roof_context: string };

    if (!parsed.opener || !parsed.local_reference || !parsed.roof_context) {
      return null;
    }

    const result = {
      opener: parsed.opener.trim(),
      local_reference: parsed.local_reference.trim(),
      roof_context: parsed.roof_context.trim(),
    };

    // Cache the result
    await supabaseAdmin
      .from("personalization_cache")
      .insert({
        contact_id: contactId,
        step_id: step.id,
        campaign_id: campaignId,
        opener: result.opener,
        local_reference: result.local_reference,
        roof_context: result.roof_context,
      })
      .catch((err) => {
        console.error("Failed to cache personalization:", err);
      });

    return result;
  } catch (error) {
    console.error("Error fetching personalization", error);
    return null;
  }
}

/**
 * Inject unsubscribe URL and personalization into email templates
 */
async function injectUnsubscribeUrl(
  job: QueueJob,
  workspaceId: string
): Promise<{ 
  subject: string; 
  bodyHtml: string | null; 
  bodyText: string | null;
  personalization: { opener: string; local_reference: string; roof_context: string } | null;
}> {
  // Load company profile once (Authority Loop v1)
  const { data: contractorProfile } = await supabaseAdmin
    .from("contractor_profile")
    .select("company_name, service_area")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  // 1) Get or create unsubscribe token
  const { data: token, error: tokenError } = await supabaseAdmin.rpc(
    "get_or_create_unsubscribe_token",
    {
      p_workspace_id: workspaceId,
      p_email: job.to_email,
      p_contact_id: job.contact_id || null,
    }
  );

  if (tokenError || !token) {
    console.error("Failed to create unsubscribe token", tokenError);
    throw new Error("unsubscribe_token_error");
  }

  const unsubscribeUrl = `${APP_URL}/u/${token}`;

  // 2) Get personalization if contact_id and step_no are available
  const personalization = await getPersonalization(
    job.contact_id || null,
    job.campaign_id,
    job.step_no || null
  );

  // 3) Build template vars with unsubscribe_url and personalization tokens
  const vars: Record<string, string> = {
    unsubscribe_url: unsubscribeUrl,
    company_name: String(contractorProfile?.company_name || "").trim(),
    service_area: String(contractorProfile?.service_area || "").trim(),
  };

  if (personalization) {
    vars.opener = personalization.opener;
    vars.local_reference = personalization.local_reference;
    vars.roof_context = personalization.roof_context;
  }

  // 4) Render subject + bodies with tokens
  const subject = job.subject
    ? renderTemplateString(job.subject, vars)
    : "";

  let bodyHtml: string | null = null;
  let bodyText: string | null = null;

  if (job.body_html) {
    const renderedHtml = renderTemplateString(job.body_html, vars);
    const withAuthority = enforceAuthorityHtml(renderedHtml, vars);
    bodyHtml = appendComplianceFooterHtml(withAuthority, vars, unsubscribeUrl);
  }

  if (job.body_text) {
    const renderedText = renderTemplateString(job.body_text, vars);
    const withAuthority = enforceAuthorityText(renderedText, vars);
    bodyText = appendComplianceFooterText(withAuthority, vars, unsubscribeUrl);
  }

  // Block obvious spammy/aggressive language (reputation shield)
  checkCopyOrThrow(subject, bodyHtml, bodyText);

  return { subject, bodyHtml, bodyText, personalization };
}

async function sendEmailForJob(
  job: QueueJob,
  renderedSubject: string,
  renderedBodyHtml: string | null,
  renderedBodyText: string | null
) {
  const account = await getAccountForJob(job);

  // Fail fast if no account wired
  if (!account) {
    throw new Error("No outbound account configured for this job");
  }

  if (account.status !== "connected") {
    throw new Error(`Outbound account status is ${account.status}`);
  }

  // Create a modified job with rendered content
  const renderedJob: QueueJob = {
    ...job,
    subject: renderedSubject,
    body_html: renderedBodyHtml,
    body_text: renderedBodyText,
  };

  // Later: enforce daily_limit / used_today here
  const provider = account.provider;

  if (provider === "gmail") {
    return await sendViaGmailStub(renderedJob, account);
  }

  if (provider === "outlook") {
    return await sendViaOutlookStub(renderedJob, account);
  }

  // default: smtp
  return await sendViaSmtpStub(renderedJob, account);
}

async function insertEvent(params: {
  job: QueueJob;
  attempt: number;
  status: "processing" | "sent" | "retry" | "failed";
  provider?: string | null;
  providerMessageId?: string | null;
  lastError?: string | null;
  personalization?: { opener: string; local_reference: string; roof_context: string } | null;
}) {
  const { job, attempt, status, provider, providerMessageId, lastError, personalization } = params;

  const { error } = await supabaseAdmin.from("campaign_send_events").insert({
    queue_id: job.id,
    campaign_id: job.campaign_id,
    lead_id: job.lead_id,
    to_email: job.to_email,
    attempt,
    status,
    provider: provider ?? job.provider ?? null,
    provider_message_id: providerMessageId ?? null,
    last_error: lastError ?? null,
    personalization: personalization ? personalization : null,
  });

  if (error) {
    console.error("Error inserting campaign_send_events row:", error);
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const workerId = crypto.randomUUID();

  // 1) Lock a batch of ready jobs (v2 with priority queueing)
  const { data: jobs, error: lockError } = await supabaseAdmin.rpc(
    "lock_send_queue_batch_v2",
    {
      p_worker_id: workerId,
      p_limit: BATCH_SIZE,
      p_workspace_id: null, // Process all workspaces
    },
  );

  if (lockError) {
    console.error("lock_send_queue_batch error:", lockError);
    return new Response(
      JSON.stringify({ error: "lock_failed", details: lockError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!jobs || jobs.length === 0) {
    return new Response(
      JSON.stringify({ processed: 0, message: "no ready jobs" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const results: Array<{ id: string; status: string }> = [];

  for (const raw of jobs as QueueJob[]) {
    const job = raw as QueueJob;
    const currentAttempt = job.attempts; // attempts was incremented in lock_send_queue_batch
    let workspaceId: string | undefined = job.workspace_id;

    // Log that this attempt started processing
    await insertEvent({
      job,
      attempt: currentAttempt,
      status: "processing",
    });

    try {
      // 1) Get workspace_id from job or campaign (required for suppression check and unsubscribe)
      workspaceId = workspaceId ?? job.workspace_id;
      
      if (!workspaceId) {
        const { data: campaign } = await supabaseAdmin
          .from("campaigns")
          .select("workspace_id")
          .eq("id", job.campaign_id)
          .maybeSingle();
        
        workspaceId = campaign?.workspace_id;
      }

      if (!workspaceId) {
        // No workspace_id found - mark as failed
        const { error: updateError } = await supabaseAdmin
          .from("campaign_send_queue")
          .update({
            status: "failed",
            last_error: "workspace_id_not_found",
            skip_reason: "workspace_id_not_found",
            locked_at: null,
            worker_id: null,
          })
          .eq("id", job.id);

        await insertEvent({
          job,
          attempt: currentAttempt,
          status: "failed",
          lastError: "workspace_id_not_found",
        });

        results.push({ id: job.id, status: "failed" });
        continue;
      }

      // 1.5) Reputation guard: follow-up cap per workspace (contractor_profile.follow_up_count)
      // step_no: 1 = first contact; follow_up_count caps follow-ups beyond first contact.
      if (job.step_no && job.step_no > 1) {
        let followupCap = workspaceFollowupCapCache.get(workspaceId);
        if (typeof followupCap !== "number") {
          const { data: profile, error: profileErr } = await supabaseAdmin
            .from("contractor_profile")
            .select("follow_up_count")
            .eq("workspace_id", workspaceId)
            .maybeSingle();
          if (profileErr) {
            console.error("Failed to load contractor_profile.follow_up_count", profileErr);
          }
          followupCap = Number(profile?.follow_up_count ?? 3);
          if (!Number.isFinite(followupCap) || followupCap < 0) followupCap = 3;
          workspaceFollowupCapCache.set(workspaceId, followupCap);
        }

        const maxStepAllowed = (followupCap ?? 3) + 1; // +1 for step 1 (first contact)
        if (job.step_no > maxStepAllowed) {
          await supabaseAdmin
            .from("campaign_send_queue")
            .update({
              status: "failed",
              last_error: "followup_cap_exceeded",
              skip_reason: "followup_cap_exceeded",
              locked_at: null,
              worker_id: null,
            })
            .eq("id", job.id);

          await insertEvent({
            job,
            attempt: currentAttempt,
            status: "failed",
            lastError: "followup_cap_exceeded",
          });

          results.push({ id: job.id, status: "failed" });
          continue;
        }
      }

      // 2) Safety Net v1: comprehensive should_send_email gate
      {
        const { data: safety, error: safetyErr } = await supabaseAdmin.rpc(
          "should_send_email",
          {
            p_workspace_id: workspaceId,
            p_email: job.to_email,
            p_campaign_id: job.campaign_id,
          },
        );

        if (safetyErr) {
          // Fail closed for compliance: if we can't verify safety, we do not send.
          console.error("should_send_email RPC failed", safetyErr);
          await supabaseAdmin
            .from("campaign_send_queue")
            .update({
              status: "failed",
              last_error: "safety_check_error",
              skip_reason: "safety_check_error",
              locked_at: null,
              worker_id: null,
            })
            .eq("id", job.id);

          await insertEvent({
            job,
            attempt: currentAttempt,
            status: "failed",
            lastError: "safety_check_error",
          });

          results.push({ id: job.id, status: "failed" });
          continue;
        }

        const shouldSend = Boolean((safety as any)?.should_send);
        if (!shouldSend) {
          const reason = String((safety as any)?.reason || "blocked");
          const message = String((safety as any)?.message || reason);
          const skipReason = `safety_net_${reason}`;

          await supabaseAdmin
            .from("campaign_send_queue")
            .update({
              status: "skipped_suppressed",
              suppressed: true,
              skip_reason: skipReason,
              last_error: message.slice(0, 500),
              locked_at: null,
              worker_id: null,
            })
            .eq("id", job.id);

          await insertEvent({
            job,
            attempt: currentAttempt,
            status: "failed",
            lastError: skipReason,
          });

          results.push({ id: job.id, status: "skipped_suppressed" });
          continue;
        }
      }

      // 2) Check sequence chaining (v2) - prevent Step 2 if Step 1 failed
      if (job.step_no && job.step_no > 1 && job.contact_id) {
        const { data: canSend, error: chainError } = await supabaseAdmin.rpc(
          "can_send_sequence_step",
          {
            p_campaign_id: job.campaign_id,
            p_contact_id: job.contact_id,
            p_step_number: job.step_no,
          }
        );

        if (chainError || !canSend) {
          // Previous step didn't send successfully - skip this step
          const { error: updateError } = await supabaseAdmin
            .from("campaign_send_queue")
            .update({
              status: "failed",
              last_error: "previous_step_not_sent",
              skip_reason: "sequence_chain_broken",
              locked_at: null,
              worker_id: null,
            })
            .eq("id", job.id);

          await insertEvent({
            job,
            attempt: currentAttempt,
            status: "failed",
            lastError: "previous_step_not_sent",
          });

          results.push({ id: job.id, status: "failed" });
          continue;
        }
      }

      // 3) Check contact suppression (bounce-aware rerouting v2)
      if (job.contact_id) {
        const { data: isContactSuppressed, error: contactSuppressionError } = await supabaseAdmin.rpc(
          "is_contact_suppressed",
          {
            p_workspace_id: workspaceId,
            p_contact_id: job.contact_id,
          }
        );

        if (contactSuppressionError) {
          console.error("Contact suppression check failed", contactSuppressionError);
        } else if (isContactSuppressed === true) {
          // Contact is suppressed - skip this job
          const { error: updateError } = await supabaseAdmin
            .from("campaign_send_queue")
            .update({
              status: "skipped_suppressed",
              skip_reason: "contact_suppressed",
              suppressed: true,
              locked_at: null,
              worker_id: null,
            })
            .eq("id", job.id);

          await insertEvent({
            job,
            attempt: currentAttempt,
            status: "failed",
            lastError: "contact_suppressed",
          });

          results.push({ id: job.id, status: "skipped_suppressed" });
          continue;
        }
      }

      // 4) Check global suppression via RPC
      const { data: isSuppressed, error: suppressionError } = await supabaseAdmin.rpc(
        "is_suppressed",
        {
          p_workspace_id: workspaceId,
          p_email: job.to_email,
        },
      );

      if (suppressionError) {
        console.error("Suppression check failed", suppressionError);
        // Treat suppression check error as failed with reason
        const { error: updateError } = await supabaseAdmin
          .from("campaign_send_queue")
          .update({
            status: "failed",
            last_error: "suppression_check_error",
            skip_reason: "suppression_check_error",
            locked_at: null,
            worker_id: null,
          })
          .eq("id", job.id);

        if (updateError) {
          console.error("Error marking job with suppression check error", job.id, updateError);
        }

        await insertEvent({
          job,
          attempt: currentAttempt,
          status: "failed",
          lastError: "suppression_check_error",
        });

        results.push({ id: job.id, status: "failed" });
        continue;
      }

      if (isSuppressed === true) {
        // Mark job as skipped due to suppression & bail
        const { error: updateError } = await supabaseAdmin
          .from("campaign_send_queue")
          .update({
            status: "skipped_suppressed",
            skip_reason: "global_suppression",
            locked_at: null,
            worker_id: null,
          })
          .eq("id", job.id);

        if (updateError) {
          console.error("Error marking suppressed job", job.id, updateError);
        }

        await insertEvent({
          job,
          attempt: currentAttempt,
          status: "failed", // Events table might not have skipped_suppressed, use failed
          lastError: "suppressed: global_suppression",
        });

        results.push({ id: job.id, status: "skipped_suppressed" });
        continue;
      }

      // 3) Inject unsubscribe URL and personalization into templates

      const { 
        subject: renderedSubject, 
        bodyHtml: renderedBodyHtml, 
        bodyText: renderedBodyText,
        personalization 
      } = await injectUnsubscribeUrl(job, workspaceId);

      // 4) Provider-aware send with rendered content
      const sendResult = await sendEmailForJob(
        job,
        renderedSubject,
        renderedBodyHtml,
        renderedBodyText
      );

      if (!sendResult.ok) {
        // Check if this is a retryable error
        const errorMessage = sendResult.error || "send_failed";
        const isRetryable = !errorMessage.includes("bounced") && 
                           !errorMessage.includes("complaint") &&
                           !errorMessage.includes("suppressed");

        if (isRetryable && currentAttempt < job.max_attempts) {
          // Schedule retry with exponential backoff (v2)
          const retryCount = (job.retry_count || 0) + 1;
          await supabaseAdmin.rpc("schedule_retry", {
            p_queue_id: job.id,
            p_retry_count: retryCount,
          });

          await insertEvent({
            job,
            attempt: currentAttempt,
            status: "retry",
            lastError: errorMessage,
          });

          results.push({ id: job.id, status: "retry" });
          continue;
        } else {
          // Not retryable or max attempts reached
          throw new Error(errorMessage);
        }
      }

      // 5) Mark as sent
      const { error: updateError } = await supabaseAdmin
        .from("campaign_send_queue")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider: sendResult.provider,
          provider_message_id: sendResult.providerMessageId ?? null,
          last_error: null,
          locked_at: null,
          worker_id: null,
        })
        .eq("id", job.id);

      if (updateError) {
        throw updateError;
      }

      // Log sent event with personalization
      await insertEvent({
        job,
        attempt: currentAttempt,
        status: "sent",
        provider: sendResult.provider,
        providerMessageId: sendResult.providerMessageId ?? null,
        personalization: personalization ? {
          opener: personalization.opener,
          local_reference: personalization.local_reference,
          roof_context: personalization.roof_context,
        } : null,
      });

      // Block 16000: Log to contact_activity timeline
      if (job.contact_id && workspaceId) {
        // Get step info for title
        let stepTitle = null;
        if (job.step_no) {
          const { data: step } = await supabaseAdmin
            .from("campaign_steps")
            .select("subject_template")
            .eq("campaign_id", job.campaign_id)
            .eq("step_no", job.step_no)
            .maybeSingle();
          stepTitle = step?.subject_template || null;
        }

        await supabaseAdmin.from("contact_activity").insert({
          workspace_id: workspaceId,
          contact_id: job.contact_id,
          activity_type: "email_sent",
          title: "Email sent",
          body: renderedSubject || stepTitle || "Email sent",
          meta: {
            campaign_id: job.campaign_id,
            step_id: job.step_no,
            provider: sendResult.provider,
            provider_message_id: sendResult.providerMessageId,
            has_personalization: !!personalization,
          },
        }).catch((err) => {
          console.error("Failed to log contact activity:", err);
          // Don't fail the send if activity logging fails
        });
      }

      results.push({ id: job.id, status: "sent" });
    } catch (err) {
      console.error("Error sending job", job.id, err);

      const lastError = String(err);
      const errorLower = lastError.toLowerCase();

      // Copy guard is never retryable.
      if (errorLower.includes("copy_blocked:")) {
        await supabaseAdmin
          .from("campaign_send_queue")
          .update({
            status: "failed",
            last_error: lastError.slice(0, 500),
            skip_reason: "copy_blocked",
            locked_at: null,
            worker_id: null,
          })
          .eq("id", job.id);

        await insertEvent({
          job,
          attempt: currentAttempt,
          status: "failed",
          lastError,
        });

        results.push({ id: job.id, status: "failed" });
        continue;
      }

      // Check if this is a bounce/complaint that should trigger suppression (v2)
      const isBounce = errorLower.includes("bounce") || errorLower.includes("hard bounce");
      const isComplaint = errorLower.includes("complaint") || errorLower.includes("spam");
      const isTempBlock = errorLower.includes("temp") || errorLower.includes("rate limit");

      if ((isBounce || isComplaint || isTempBlock) && job.contact_id && workspaceId) {
        // Suppress contact (bounce-aware rerouting v2)
        const reason = isBounce ? "bounce" : isComplaint ? "complaint" : "temp_block";
        
        await supabaseAdmin.rpc("suppress_contact", {
          p_workspace_id: workspaceId,
          p_contact_id: job.contact_id,
          p_email: job.to_email,
          p_reason: reason,
        });

        // Log deliverability event
        await supabaseAdmin.from("deliverability_events").insert({
          workspace_id: workspaceId,
          campaign_id: job.campaign_id,
          contact_id: job.contact_id,
          event_type: isBounce ? "bounce_detected" : "complaint_detected",
          event_data: {
            queue_id: job.id,
            reason: reason,
            error: lastError,
          },
        }).catch((logErr) => {
          console.error("Failed to log deliverability event:", logErr);
        });
      }

      const isMaxed = job.attempts >= job.max_attempts;
      
      if (isMaxed) {
        // Max attempts reached - mark as failed
        const { error: errUpdate } = await supabaseAdmin
          .from("campaign_send_queue")
          .update({
            status: "failed",
            last_error: lastError,
            locked_at: null,
            worker_id: null,
          })
          .eq("id", job.id);

        if (errUpdate) {
          console.error("Error updating failed job", job.id, errUpdate);
        }

        await insertEvent({
          job,
          attempt: currentAttempt,
          status: "failed",
          lastError,
        });

        results.push({ id: job.id, status: "failed" });
      } else {
        // Schedule retry with exponential backoff (v2)
        const retryCount = (job.retry_count || 0) + 1;
        await supabaseAdmin.rpc("schedule_retry", {
          p_queue_id: job.id,
          p_retry_count: retryCount,
        });

        await insertEvent({
          job,
          attempt: currentAttempt,
          status: "retry",
          lastError,
        });

        results.push({ id: job.id, status: "retry" });
      }
    }
  }

  return new Response(
    JSON.stringify({
      processed: results.length,
      results,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
