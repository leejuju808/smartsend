// Block 14200 — Reply Detection + Intent Classification v1
// Edge Function: handle-new-reply-intent
// Processes inbound email replies and classifies their intent using AI

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import OpenAI from "https://esm.sh/openai@4.57.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({
  apiKey: openaiApiKey,
});

type IntentLabel =
  | "hot_lead"
  | "warm_lead"
  | "follow_up"
  | "not_interested"
  | "out_of_office"
  | "wrong_contact"
  | "unsubscribe"
  | "other";

interface ClassificationResult {
  label: IntentLabel;
  confidence: number;
  raw: any;
}

serve(async (_req) => {
  try {
    // 1) Grab a small batch of unprocessed inbound replies
    const { data: messages, error } = await supabase
      .from("email_messages")
      .select(
        "id, contact_id, workspace_id, body_text, created_at, from_email, campaign_id"
      )
      .or("direction.eq.inbound,direction.eq.in")
      .eq("is_processed_for_intent", false)
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) {
      console.error("Error fetching messages:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let processedCount = 0;

    for (const msg of messages) {
      try {
        // Skip if no body_text
        if (!msg.body_text || msg.body_text.trim().length === 0) {
          await supabase
            .from("email_messages")
            .update({ is_processed_for_intent: true })
            .eq("id", msg.id);
          continue;
        }

        // Ensure we have workspace_id and contact_id
        let workspaceId = msg.workspace_id;
        let contactId = msg.contact_id;

        // Derive workspace_id from campaign if missing
        if (!workspaceId && msg.campaign_id) {
          const { data: campaign } = await supabase
            .from("campaigns")
            .select("workspace_id")
            .eq("id", msg.campaign_id)
            .single();
          if (campaign?.workspace_id) {
            workspaceId = campaign.workspace_id;
            // Update the message
            await supabase
              .from("email_messages")
              .update({ workspace_id: workspaceId })
              .eq("id", msg.id);
          }
        }

        // Derive contact_id from from_email if missing
        if (!contactId && msg.from_email && workspaceId) {
          const { data: contact } = await supabase
            .from("contacts")
            .select("id")
            .eq("workspace_id", workspaceId)
            .ilike("email", msg.from_email)
            .maybeSingle();
          if (contact?.id) {
            contactId = contact.id;
            // Update the message
            await supabase
              .from("email_messages")
              .update({ contact_id: contactId })
              .eq("id", msg.id);
          }
        }

        // Skip if we still don't have workspace_id
        if (!workspaceId) {
          console.warn(`Skipping message ${msg.id}: no workspace_id`);
          await supabase
            .from("email_messages")
            .update({ is_processed_for_intent: true })
            .eq("id", msg.id);
          continue;
        }

        // 2) Load workspace profile (for context)
        const { data: profile } = await supabase
          .from("workspace_profile")
          .select("*")
          .eq("workspace_id", workspaceId)
          .maybeSingle();

        // 3) Classify reply intent
        const { label, confidence, raw } = await classifyReplyIntent({
          replyText: msg.body_text,
          profile,
        });

        // 4) Update email_messages with intent
        const { error: updateError } = await supabase
          .from("email_messages")
          .update({
            intent_label: label,
            intent_confidence: confidence,
            intent_raw: raw,
            is_processed_for_intent: true,
          })
          .eq("id", msg.id);

        if (updateError) {
          console.error("Failed to update message:", updateError);
          continue;
        }

        // 5) Apply downstream effects: lead status + activity + tasks (Block 14700)
        if (contactId) {
          await handleIntentSideEffects(supabase, {
            messageId: msg.id,
            contactId,
            workspaceId,
            campaignId: msg.campaign_id || null,
            label,
            confidence,
            replyText: msg.body_text,
          });
        }

        // 6) Block 16100 — Apply workflow automation (if enabled)
        if (contactId) {
          await applyWorkflowAutomation(supabase, {
            workspaceId,
            contactId,
            intentLabel: label,
            eventType: "reply_received",
          });
        }

        processedCount++;
      } catch (err) {
        console.error(`Intent classification failed for message ${msg.id}:`, err);
        // Mark as processed to avoid infinite retries
        await supabase
          .from("email_messages")
          .update({ is_processed_for_intent: true })
          .eq("id", msg.id);
      }
    }

    return new Response(
      JSON.stringify({ processed: processedCount, total: messages.length }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("handle-new-reply-intent error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

/**
 * Classify reply intent using OpenAI
 */
async function classifyReplyIntent({
  replyText,
  profile,
}: {
  replyText: string;
  profile: any | null;
}): Promise<ClassificationResult> {
  const companyName = profile?.company_name || "the roofing company";
  const city = profile?.primary_city || "their city";

  const system = `
You classify email replies to a local roofing company doing cold outreach.

Output:
- intent label
- confidence (0-1)
- short reason.

Labels:
- "hot_lead"         = wants an estimate, wants to talk, clear intent
- "warm_lead"        = interested but has questions / maybe / later
- "follow_up"        = neutral response, needs more info or reminder
- "not_interested"   = clearly says no
- "out_of_office"    = auto-response, vacation, away
- "wrong_contact"    = not homeowner / wrong person
- "unsubscribe"      = asks to stop emailing
- "other"            = anything else.

Be conservative on hot_lead: only if they clearly want next steps.
`.trim();

  const user = `
Company: ${companyName} (roofing in ${city})

Reply:

"""
${replyText}
"""

Respond in JSON like:

{
  "label": "hot_lead",
  "confidence": 0.91,
  "reason": "They asked to schedule a roof inspection this week."
}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0].message.content || "{}";
  const parsed = JSON.parse(raw) as {
    label: IntentLabel;
    confidence: number;
    reason?: string;
  };

  const label = parsed.label || "other";
  const confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0.7));

  return {
    label,
    confidence,
    raw: { ...parsed, reason: parsed.reason },
  };
}

/**
 * Handle side effects of intent classification:
 * - Update lead_status (Block 8920)
 * - Log to contact_activity timeline
 * - Add to suppression list if unsubscribe
 */
async function handleIntentSideEffects(
  supabase: ReturnType<typeof createClient>,
  params: {
    messageId: string;
    contactId: string;
    workspaceId: string;
    campaignId: string | null;
    label: IntentLabel;
    confidence: number;
    replyText: string;
  }
) {
  const { contactId, label, confidence, replyText, workspaceId, campaignId } = params;

  // Block 8920: Update lead_status from intent classification
  if (campaignId) {
    // Get account_id from workspace or campaign
    let accountId: string | null = null;
    
    // Try to get from workspace owner
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", workspaceId)
      .single();
    
    if (workspace?.owner_id) {
      accountId = workspace.owner_id;
    } else {
      // Fallback: get from campaign
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("account_id, user_id, workspace_id")
        .eq("id", campaignId)
        .single();
      
      accountId = campaign?.account_id || campaign?.user_id || null;
    }

    if (accountId) {
      // Map label to intent string for RPC function
      const intentMap: Record<string, string> = {
        hot_lead: "hot",
        warm_lead: "warm",
        follow_up: "neutral",
        not_interested: "not_interested",
        unsubscribe: "unsubscribe",
        out_of_office: "neutral",
        wrong_contact: "neutral",
        other: "neutral",
      };

      const intent = intentMap[label] || "neutral";

      // Call RPC function to update lead_status
      const { error: rpcError } = await supabase.rpc("update_lead_status_from_intent", {
        p_account_id: accountId,
        p_campaign_id: campaignId,
        p_contact_id: contactId,
        p_intent: intent,
      });

      if (rpcError) {
        console.error("Failed to update lead_status via RPC:", rpcError);
      }
    }
  }

  // Legacy: Also update contacts.lead_status for backward compatibility
  let leadStatus: string | null = null;

  if (label === "hot_lead") leadStatus = "hot";
  if (label === "warm_lead") leadStatus = "warm";
  if (label === "follow_up") leadStatus = "attempting";
  if (label === "not_interested" || label === "unsubscribe")
    leadStatus = "lost";

  if (leadStatus) {
    const { error: updateError } = await supabase
      .from("contacts")
      .update({ lead_status: leadStatus })
      .eq("id", contactId);

    if (updateError) {
      console.error("Failed to update contacts.lead_status:", updateError);
    }
  }

  // 1b) Block 15300: Auto-tag lead source based on reply content (Insurance vs Retail)
  const replyLower = replyText.toLowerCase();
  const insuranceKeywords = [
    "insurance",
    "claim",
    "adjuster",
    "state farm",
    "allstate",
    "claim number",
    "submitted a claim",
    "filing a claim",
    "insurance claim",
  ];
  const retailKeywords = [
    "what's the price",
    "how much",
    "looking for estimate",
    "cash job",
    "out of pocket",
    "how much does it cost",
    "what does it cost",
    "price quote",
  ];

  const isInsuranceLead = insuranceKeywords.some((keyword) =>
    replyLower.includes(keyword)
  );
  const isRetailLead = retailKeywords.some((keyword) =>
    replyLower.includes(keyword)
  );

  if (isInsuranceLead || isRetailLead) {
    // Get existing source_meta
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, source_meta")
      .eq("id", contactId)
      .single();

    if (contact) {
      const existingMeta = (contact.source_meta as any) || {};
      const leadSourceToApply = isInsuranceLead ? "insurance_lead" : "retail_lead";

      await supabase
        .from("contacts")
        .update({
          lead_source: leadSourceToApply,
          source_meta: {
            ...existingMeta,
            detected_intent: isInsuranceLead ? "insurance" : "retail",
            reply_text_excerpt: replyText.slice(0, 200),
            detected_at: new Date().toISOString(),
          },
        })
        .eq("id", contactId);
    }
  }

  // 2) Block 16000: Log intent detection to contact_activity
  // Simple keyword extraction helper
  const extractKeywords = (text: string): string[] => {
    const keywords: string[] = [];
    const lowerText = text.toLowerCase();
    const keywordPatterns = [
      "insurance", "claim", "estimate", "quote", "inspection",
      "interested", "schedule", "call", "available", "when",
      "not interested", "stop", "unsubscribe", "remove",
    ];
    for (const pattern of keywordPatterns) {
      if (lowerText.includes(pattern)) {
        keywords.push(pattern);
      }
    }
    return keywords.slice(0, 5); // Limit to 5 keywords
  };

  const { error: activityError } = await supabase
    .from("contact_activity")
    .insert({
      workspace_id: workspaceId,
      contact_id: contactId,
      activity_type: "intent_detected",
      title: `Intent: ${label.replace("_", " ")}`,
      body: replyText.slice(0, 500), // Truncate long replies
      meta: {
        intent: label,
        intent_label: label,
        intent_confidence: confidence,
        keywords: extractKeywords(replyText),
      },
    });

  if (activityError) {
    console.error("Failed to log intent detection activity:", activityError);
  }

  // 3) Block 16000: Log pipeline stage change if status changed
  if (leadStatus) {
    // Get current status to compare
    const { data: currentContact } = await supabase
      .from("contacts")
      .select("lead_status")
      .eq("id", contactId)
      .maybeSingle();

    const oldStatus = currentContact?.lead_status || null;
    if (oldStatus !== leadStatus) {
      await supabase.from("contact_activity").insert({
        workspace_id: workspaceId,
        contact_id: contactId,
        activity_type: "pipeline_stage_changed",
        title: `Status changed: ${oldStatus || "none"} → ${leadStatus}`,
        meta: {
          old_stage: oldStatus,
          new_stage: leadStatus,
          from_intent: label,
        },
      });
    }
  }

  // 4) Add to suppression if unsubscribe
  if (label === "unsubscribe") {
    // Try to get contact email
    const { data: contact } = await supabase
      .from("contacts")
      .select("email")
      .eq("id", contactId)
      .single();

    if (contact?.email) {
      // Try global_suppression_list first
      const { error: suppError } = await supabase
        .from("global_suppression_list")
        .insert({
          contact_id: contactId,
          reason: "unsubscribe_reply",
        })
        .select();

      // If that table doesn't exist, try global_suppressions
      if (suppError) {
        await supabase.from("global_suppressions").insert({
          workspace_id: workspaceId,
          email: contact.email,
          reason: "unsubscribe_reply",
          source: "ai_classification",
        });
      }
    }
  }

  // 5) Create a task for hot/warm/follow_up intents (Block 14700)
  if (
    label === "hot_lead" ||
    label === "warm_lead" ||
    label === "follow_up"
  ) {
    await createTaskForIntent(supabase, {
      workspaceId,
      contactId,
      label,
      replyText,
      messageId: params.messageId,
    });
  }

  // 6) Send notifications for hot/warm leads (Block 14800)
  if (label === "hot_lead" || label === "warm_lead") {
    await sendHotWarmNotifications(supabase, {
      workspaceId,
      contactId,
      messageId: params.messageId,
      label,
      replyText,
    });
  }
}

/**
 * Create a task for intent labels (Block 14700)
 * hot_lead → "Call this homeowner ASAP" (due today)
 * warm_lead → "Follow up with this interested lead" (due tomorrow)
 * follow_up → "Send more info to this lead" (due in 2 days)
 */
async function createTaskForIntent(
  supabase: ReturnType<typeof createClient>,
  params: {
    workspaceId: string;
    contactId: string;
    label: IntentLabel;
    replyText: string;
    messageId: string;
  }
) {
  const { workspaceId, contactId, label, replyText, messageId } = params;

  let title: string | null = null;
  let type: "call" | "email" | "todo" = "call";
  let priority: "low" | "normal" | "high" = "high";
  const now = new Date();
  let dueAt = new Date(now);

  if (label === "hot_lead") {
    title = "CALL THIS HOT LEAD";
    dueAt = now; // today / ASAP
    priority = "high";
  } else if (label === "warm_lead") {
    title = "Follow up with this interested lead";
    dueAt.setDate(dueAt.getDate() + 1); // tomorrow
    priority = "normal";
  } else if (label === "follow_up") {
    title = "Send more info to this lead";
    dueAt.setDate(dueAt.getDate() + 2); // 2 days
    type = "email";
    priority = "normal";
  }

  if (!title) return; // only create for these labels for v1

  // Block 16300: Get contact owner for task assignment
  const { data: contact } = await supabase
    .from("contacts")
    .select("owner_user_id")
    .eq("id", contactId)
    .single();

  let taskOwnerId: string | null = contact?.owner_user_id || null;
  if (!taskOwnerId) {
    // Fallback to workspace owner
    const { data: workspaceOwner } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("role", "owner")
      .limit(1)
      .single();
    taskOwnerId = workspaceOwner?.user_id || null;
  }

  await supabase.from("tasks").insert({
    workspace_id: workspaceId,
    contact_id: contactId,
    email_message_id: messageId,
    title,
    description: replyText?.slice(0, 500) ?? null,
    type,
    priority,
    due_at: dueAt.toISOString(),
    status: "open",
    source: "auto",
    owner_user_id: taskOwnerId, // Block 16300: Assign task to contact owner
    trigger_meta: {
      from_intent: label,
    },
  });
}

/**
 * Block 14800 — Send notifications for hot/warm leads
 * Creates in-app notifications and sends email alerts
 */
async function sendHotWarmNotifications(
  supabase: ReturnType<typeof createClient>,
  params: {
    workspaceId: string;
    contactId: string;
    messageId: string;
    label: IntentLabel;
    replyText: string;
  }
) {
  const { workspaceId, contactId, label, messageId, replyText } = params;

  // Load contact info
  const { data: contact } = await supabase
    .from("contacts")
    .select("first_name, last_name, email, city")
    .eq("id", contactId)
    .single();

  if (!contact) {
    console.error("Contact not found for notification");
    return;
  }

  // Get workspace members
  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);

  if (!members || members.length === 0) {
    return;
  }

  const userIds = members.map((m: any) => m.user_id);

  // Get notification preferences for these users
  const { data: prefsRows } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("user_id", userIds);

  // Get user emails from auth.users (using admin client)
  // Build a map of user_id -> email
  const usersMap: Record<string, { email: string }> = {};
  for (const userId of userIds) {
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      if (userData?.user?.email) {
        usersMap[userId] = { email: userData.user.email };
      }
    } catch (err) {
      console.error(`Failed to get user ${userId}:`, err);
    }
  }

  const title =
    label === "hot_lead"
      ? "New HOT lead reply"
      : "New warm lead reply";

  const displayName =
    (contact?.first_name || contact?.last_name) ??
    contact?.email ??
    "Unknown contact";

  const bodyText = `From: ${displayName}
City: ${contact?.city ?? "N/A"}

Reply:
${replyText}`;

  // Create in-app notifications and collect email recipients
  const emailRecipients: Array<{ email: string; userId: string }> = [];

  for (const userId of userIds) {
    const user = usersMap[userId];
    if (!user?.email) continue;

    const prefs = prefsRows?.find((p: any) => p.user_id === userId);
    let wantsEmail = false;

    if (label === "hot_lead") {
      wantsEmail = prefs?.notify_hot_lead_email ?? true; // default true
    } else if (label === "warm_lead") {
      wantsEmail = prefs?.notify_warm_lead_email ?? true; // default true
    }

    // Create in-app notification
    await supabase.from("notifications").insert({
      user_id: userId,
      workspace_id: workspaceId,
      type: label === "hot_lead" ? "hot_lead" : "warm_lead",
      title,
      body: bodyText.slice(0, 1000),
      contact_id: contactId,
      email_message_id: messageId,
      read: false,
      is_read: false,
    });

    if (wantsEmail) {
      emailRecipients.push({ email: user.email, userId });
    }
  }

  // Send email alerts via Resend
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("EMAIL_FROM") || "SmartSend <no-reply@smartsendhq.com>";

  if (resendKey && emailRecipients.length > 0) {
    for (const recipient of emailRecipients) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: recipient.email,
            subject: `[SmartSend] ${title}: ${displayName}`,
            text: bodyText,
            html: `<div style="font-family: sans-serif; padding: 20px;">
              <h2>${title}</h2>
              <p><strong>From:</strong> ${displayName}</p>
              <p><strong>City:</strong> ${contact?.city ?? "N/A"}</p>
              <hr style="margin: 20px 0;" />
              <h3>Reply:</h3>
              <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px; white-space: pre-wrap;">${replyText}</pre>
              <p style="margin-top: 20px;">
                <a href="${Deno.env.get("SUPABASE_URL")?.replace("/rest/v1", "") || ""}/dashboard/contacts/${contactId}" 
                   style="background: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                  View Contact →
                </a>
              </p>
            </div>`,
          }),
        });

        if (!emailRes.ok) {
          console.error(`Failed to send email to ${recipient.email}:`, await emailRes.text());
        }
      } catch (err) {
        console.error(`Error sending email to ${recipient.email}:`, err);
      }
    }
  }
}

/**
 * Block 16100 — Apply workflow automation based on workspace settings
 */
async function applyWorkflowAutomation(
  supabase: ReturnType<typeof createClient>,
  params: {
    workspaceId: string;
    contactId: string;
    intentLabel: IntentLabel;
    eventType: "reply_received" | "lead_marked_won";
  }
) {
  const { workspaceId, contactId, intentLabel, eventType } = params;

  // Load workspace workflow settings
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("auto_workflows")
    .eq("id", workspaceId)
    .single();

  const workflows = workspace?.auto_workflows || {
    on_reply_create_task: true,
    on_hot_lead_stage_change: true,
    on_warm_lead_stage_change: true,
    on_won_log_revenue: true,
  };

  // Load contact + pipeline stages
  const [{ data: contact }, { data: stages }] = await Promise.all([
    supabase
      .from("contacts")
      .select(
        "id, first_name, last_name, lead_status, pipeline_stage_id, est_job_value, actual_job_value, owner_user_id"
      )
      .eq("id", contactId)
      .single(),
    supabase
      .from("pipeline_stages")
      .select("id, key, label")
      .eq("workspace_id", workspaceId),
  ]);

  if (!contact) return;

  // Helper: get stage by key
  function stageIdForKey(key: string): string | null {
    const s = stages?.find((st) => st.key === key);
    return s ? s.id : null;
  }

  // EVENT: REPLY
  if (eventType === "reply_received") {
    // 1) Create follow-up task (if enabled and not unsub/not interested)
    if (
      workflows.on_reply_create_task &&
      intentLabel !== "unsubscribe" &&
      intentLabel !== "not_interested"
    ) {
      const title =
        intentLabel === "hot_lead"
          ? "CALL: Hot roofing lead replied"
          : "Follow up with homeowner";

      const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow

      // Block 16300: Get default owner (contact owner or workspace owner)
      let taskOwnerId: string | null = contact.owner_user_id || null;
      if (!taskOwnerId) {
        // Fallback to workspace owner
        const { data: workspaceOwner } = await supabase
          .from("workspace_members")
          .select("user_id")
          .eq("workspace_id", workspaceId)
          .eq("role", "owner")
          .limit(1)
          .single();
        taskOwnerId = workspaceOwner?.user_id || null;
      }

      const { data: task } = await supabase
        .from("tasks")
        .insert({
          workspace_id: workspaceId,
          contact_id: contact.id,
          title,
          due_at: dueAt.toISOString(),
          status: "open",
          source: "auto",
          owner_user_id: taskOwnerId, // Block 16300: Assign task to contact owner
        })
        .select("id")
        .single();

      // Log activity
      await supabase.from("contact_activity").insert({
        workspace_id: workspaceId,
        contact_id: contact.id,
        activity_type: "task_created",
        title,
        meta: { task_id: task?.id, reason: "reply_received" },
      });
    }

    // 2) Hot lead → upgrade lead_status + pipeline stage
    if (intentLabel === "hot_lead" && workflows.on_hot_lead_stage_change) {
      const newStageId =
        stageIdForKey("proposal") ||
        stageIdForKey("hot") ||
        contact.pipeline_stage_id;

      await supabase
        .from("contacts")
        .update({
          lead_status: "hot",
          pipeline_stage_id: newStageId,
        })
        .eq("id", contact.id);

      await supabase.from("contact_activity").insert({
        workspace_id: workspaceId,
        contact_id: contact.id,
        activity_type: "lead_status_changed",
        title: "Lead marked HOT (auto)",
        meta: {
          from: contact.lead_status,
          to: "hot",
          trigger: "intent_hot_lead",
        },
      });

      await supabase.from("contact_activity").insert({
        workspace_id: workspaceId,
        contact_id: contact.id,
        activity_type: "pipeline_stage_changed",
        title: "Moved to Hot/Proposal stage (auto)",
        meta: {
          new_stage_id: newStageId,
        },
      });
    }

    // 3) Warm lead → move into working stage
    if (intentLabel === "warm_lead" && workflows.on_warm_lead_stage_change) {
      const newStageId =
        stageIdForKey("qualified") ||
        stageIdForKey("working") ||
        contact.pipeline_stage_id;

      await supabase
        .from("contacts")
        .update({
          lead_status: "warm",
          pipeline_stage_id: newStageId,
        })
        .eq("id", contact.id);

      await supabase.from("contact_activity").insert({
        workspace_id: workspaceId,
        contact_id: contact.id,
        activity_type: "lead_status_changed",
        title: "Lead marked WARM (auto)",
        meta: {
          from: contact.lead_status,
          to: "warm",
          trigger: "intent_warm_lead",
        },
      });

      await supabase.from("contact_activity").insert({
        workspace_id: workspaceId,
        contact_id: contact.id,
        activity_type: "pipeline_stage_changed",
        title: "Moved to Working/Qualified stage (auto)",
        meta: {
          new_stage_id: newStageId,
        },
      });
    }
  }

  // EVENT: LEAD MARKED WON
  if (eventType === "lead_marked_won" && workflows.on_won_log_revenue) {
    await supabase.from("contact_activity").insert({
      workspace_id: workspaceId,
      contact_id: contact.id,
      activity_type: "lead_status_changed",
      title: "Lead marked WON",
      meta: {
        value: contact.actual_job_value || contact.est_job_value || null,
      },
    });
  }
}

