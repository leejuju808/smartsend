// Block 8340 — Auto-Intent Processing (Auto-Classify All New Replies via Edge Function)
// Edge Function: classify-reply
// This function accepts POST { reply_id, force?: boolean }
// Loads the reply from campaign_replies, classifies it with OpenAI, and stores the result

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import OpenAI from "https://esm.sh/openai@4.69.0";

type ReplyIntent =
  | "positive"
  | "neutral"
  | "negative"
  | "out_of_office"
  | "unsubscribe"
  | "bounce"
  | "spam"
  | "wrong_person"
  | "referral"
  | "not_sure";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const openAIApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase env vars");
}

if (!openAIApiKey) {
  console.error("Missing OPENAI_API_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const openai = new OpenAI({ apiKey: openAIApiKey });

const CLASSIFIER_VERSION = "gpt-4.1-mini-reply-intent-v1";

interface ClassifierResult {
  intent: ReplyIntent;
  sub_intent: string;
  sentiment: "positive" | "neutral" | "negative";
  confidence: number; // 0–1
  reason: string;
  suggested_action: string;
}

type PlanName = "free" | "pro" | "enterprise" | "unknown";

function normalizePlan(plan?: string | null, status?: string | null): {
  plan: PlanName;
  status: string;
} {
  const rawPlan = (plan ?? "free").toLowerCase() as PlanName;
  const rawStatus = (status ?? "inactive").toLowerCase();

  if (rawPlan === "pro" && ["active", "trialing"].includes(rawStatus)) {
    return { plan: "pro", status: rawStatus };
  }

  if (rawPlan === "enterprise" && ["active", "trialing"].includes(rawStatus)) {
    return { plan: "enterprise", status: rawStatus };
  }

  if (rawPlan === "free") {
    return { plan: "free", status: rawStatus };
  }

  return { plan: "unknown", status: rawStatus };
}

function hasProAI(planInfo: { plan: PlanName; status: string }): boolean {
  return planInfo.plan === "pro" || planInfo.plan === "enterprise";
}

async function maybeCreateSpeedToLeadJob(args: {
  supabase: ReturnType<typeof createClient>;
  campaignId: string;
  campaignLeadId: string;
  leadId: string;
  replyId: string;
  intent: ReplyIntent;
  sentiment: string | null;
  threadSummary: string | null;
}) {
  const { supabase, campaignId, campaignLeadId, leadId, replyId, intent, sentiment, threadSummary } =
    args;

  // 1. Load campaign settings
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select(
      "id, owner_id, owner_user_id, user_id, speed_to_lead_enabled, speed_to_lead_delay_seconds, speed_to_lead_intents"
    )
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    console.error("Speed-to-lead: campaign not found", campaignError);
    return;
  }

  if (!campaign.speed_to_lead_enabled) {
    return;
  }

  // 2. Get owner user ID (check multiple fields for compatibility)
  const ownerUserId = campaign.owner_id || campaign.owner_user_id || campaign.user_id;
  if (!ownerUserId) {
    console.error("Speed-to-lead: no owner found for campaign", campaignId);
    return;
  }

  // 3. Plan gate (Pro only)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("plan, plan_status")
    .eq("id", ownerUserId)
    .single();

  if (profileError || !profile) {
    console.error("Speed-to-lead: profile not found", profileError);
    return;
  }

  const planInfo = normalizePlan(profile.plan, profile.plan_status);
  if (!hasProAI(planInfo)) {
    console.log("Speed-to-lead blocked for non-Pro user", planInfo);
    return;
  }

  // 4. Check intent is in allowed list
  const allowedIntents: string[] = campaign.speed_to_lead_intents ?? [];
  if (!allowedIntents.includes(intent)) {
    return;
  }

  // 5. Create job row
  const delaySeconds = campaign.speed_to_lead_delay_seconds ?? 300;
  const scheduledAt = new Date(Date.now() + delaySeconds * 1000).toISOString();

  const { error: insertError } = await supabase.from("speed_to_lead_jobs").insert({
    campaign_id: campaignId,
    campaign_lead_id: campaignLeadId,
    lead_id: leadId,
    reply_id: replyId,
    reply_intent: intent,
    reply_sentiment: sentiment,
    thread_summary: threadSummary,
    scheduled_at: scheduledAt,
  });

  if (insertError) {
    console.error("Speed-to-lead: failed to insert job", insertError);
  } else {
    console.log("Speed-to-lead: created job for reply", replyId, "scheduled at", scheduledAt);
  }
}

// Block 8500 — Auto-Suppression from Reply Intent
interface IntentContext {
  campaign_id: string;
  campaign_lead_id: string;
  lead_id: string;
  reply_id: string;
  intent: ReplyIntent;
  sentiment: string | null;
  thread_summary: string | null;
  workspace_id: string;
}

async function applyIntentSideEffects(
  supabase: ReturnType<typeof createClient>,
  ctx: IntentContext
) {
  const {
    campaign_id,
    campaign_lead_id,
    lead_id,
    reply_id,
    intent,
    sentiment,
    thread_summary,
    workspace_id,
  } = ctx;

  // 1) Load lead for email
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, email")
    .eq("id", lead_id)
    .single();

  if (leadError || !lead) {
    console.error("applyIntentSideEffects: lead not found", leadError);
    return;
  }

  // 2) Derive statuses based on intent
  let campaignLeadStatus: string | null = null;
  let leadStatus: string | null = null;
  let shouldSuppress = false;
  let suppressionReason: string | null = null;

  switch (intent) {
    case "positive":
    case "referral":
      campaignLeadStatus = "hot_lead";
      leadStatus = "engaged";
      break;
    case "unsubscribe":
      campaignLeadStatus = "unsubscribed";
      leadStatus = "unsubscribed";
      shouldSuppress = true;
      suppressionReason = "unsubscribe_reply";
      break;
    case "bounce":
      campaignLeadStatus = "bounced";
      leadStatus = "bounced";
      shouldSuppress = true;
      suppressionReason = "hard_bounce";
      break;
    case "spam":
      campaignLeadStatus = "complaint";
      leadStatus = "complaint";
      shouldSuppress = true;
      suppressionReason = "spam_complaint";
      break;
    case "wrong_person":
      campaignLeadStatus = "wrong_person";
      leadStatus = "bad_fit";
      break;
    default:
      campaignLeadStatus = null;
      leadStatus = null;
  }

  // 3) Update campaign_leads
  const campaignLeadUpdate: Record<string, any> = {
    last_reply_intent: intent,
    last_reply_sentiment: sentiment,
    replied_at: new Date().toISOString(),
  };

  // Add thread_summary if available
  if (thread_summary) {
    campaignLeadUpdate.thread_summary = thread_summary;
  }

  // Update status_enum if we have a status
  if (campaignLeadStatus) {
    // Map to enum values
    if (campaignLeadStatus === "unsubscribed") {
      campaignLeadUpdate.status_enum = "unsubscribed";
    } else if (campaignLeadStatus === "bounced") {
      campaignLeadUpdate.status_enum = "bounced";
    } else if (campaignLeadStatus === "hot_lead" || campaignLeadStatus === "engaged") {
      campaignLeadUpdate.status_enum = "replied";
    }
    // Also update text status for backward compatibility
    campaignLeadUpdate.status = campaignLeadStatus;
  }

  const { error: clError } = await supabase
    .from("campaign_leads")
    .update(campaignLeadUpdate)
    .eq("id", campaign_lead_id);

  if (clError) {
    console.error("applyIntentSideEffects: failed to update campaign_leads", clError);
  }

  // 4) Update leads master record
  const leadUpdate: Record<string, any> = {
    last_reply_intent: intent,
    last_reply_sentiment: sentiment,
    last_contacted_at: new Date().toISOString(),
  };

  if (leadStatus) {
    leadUpdate.status = leadStatus;
    // Also set boolean flags if they exist
    if (leadStatus === "unsubscribed") {
      leadUpdate.unsubscribed = true;
    } else if (leadStatus === "bounced") {
      leadUpdate.bounced = true;
    }
  }

  const { error: leadUpdateError } = await supabase
    .from("leads")
    .update(leadUpdate)
    .eq("id", lead_id);

  if (leadUpdateError) {
    console.error("applyIntentSideEffects: failed to update leads", leadUpdateError);
  }

  // 5) Auto-suppress on unsubscribe / bounce / spam
  if (shouldSuppress && lead?.email) {
    const email = (lead.email as string).toLowerCase().trim();

    const { data: existing, error: existingError } = await supabase
      .from("global_suppressions")
      .select("id, active, reason")
      .eq("workspace_id", workspace_id)
      .eq("email", email)
      .maybeSingle();

    if (existingError) {
      console.error("applyIntentSideEffects: load suppression error", existingError);
    }

    if (existing) {
      // update existing row
      const newReason = existing.reason || suppressionReason || "reply_suppression";
      const { error: supUpdateError } = await supabase
        .from("global_suppressions")
        .update({
          active: true,
          reason: newReason,
          source: "reply",
          source_type: "reply",
          source_campaign_id: campaign_id,
          source_campaign_reply_id: reply_id,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (supUpdateError) {
        console.error(
          "applyIntentSideEffects: failed to update global_suppressions",
          supUpdateError
        );
      }
    } else {
      // insert new suppression row
      const { error: supInsertError } = await supabase
        .from("global_suppressions")
        .insert({
          workspace_id,
          email,
          reason: suppressionReason ?? "reply_suppression",
          active: true,
          source: "reply",
          source_type: "reply",
          source_campaign_id: campaign_id,
          source_campaign_reply_id: reply_id,
          last_seen_at: new Date().toISOString(),
        });

      if (supInsertError) {
        console.error(
          "applyIntentSideEffects: failed to insert global_suppressions",
          supInsertError
        );
      }
    }
  }
}

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const authHeader = req.headers.get("authorization") ?? "";
    // Optional: you can check a shared secret here if you want
    // const expected = `Bearer ${Deno.env.get("INTERNAL_FUNCTION_SECRET")}`;
    // if (authHeader !== expected) { ... }

    const body = await req.json().catch(() => null);
    const replyId = body?.reply_id as string | undefined;
    const force = Boolean(body?.force);

    if (!replyId) {
      return new Response("Missing reply_id", { status: 400 });
    }

    // 1. Load the reply
    const { data: reply, error: fetchError } = await supabase
      .from("campaign_replies")
      .select(
        "id, campaign_id, lead_id, subject, raw_text, from_email, to_email, intent, classified_at"
      )
      .eq("id", replyId)
      .single();

    if (fetchError || !reply) {
      console.error("Failed to load reply:", fetchError);
      return new Response("Reply not found", { status: 404 });
    }

    if (reply.classified_at && !force) {
      return Response.json({
        status: "already_classified",
        reply_id: reply.id,
        intent: reply.intent,
      });
    }

    const emailText = (reply.raw_text ?? "").toString();
    const subject = (reply.subject ?? "").toString();

    if (!emailText.trim() && !subject.trim()) {
      return new Response("Reply has no text to classify", { status: 422 });
    }

    // 2. Build prompt for OpenAI
    const userPrompt = `
You are classifying a reply to a cold email campaign.

Reply metadata:
- From: ${reply.from_email ?? "unknown"}
- To: ${reply.to_email ?? "unknown"}
- Subject: ${subject || "(no subject)"}

Reply text:
"""${emailText}"""

Your job:

1. Decide the main intent of this reply from this fixed list:
   - positive
   - neutral
   - negative
   - out_of_office
   - unsubscribe
   - bounce
   - spam
   - wrong_person
   - referral
   - not_sure

2. Set a simple sentiment:
   - positive
   - neutral
   - negative

3. Provide a short sub_intent such as:
   - "book_meeting"
   - "pricing_question"
   - "send_more_info"
   - "not_interested"
   - "permanent_unsubscribe"
   - "candidate_referral"
   - etc.

4. Give a confidence score between 0 and 1.

5. Suggest one concrete action the system should take, e.g.:
   - "stop all future emails and mark lead as unsubscribed"
   - "create follow-up task for SDR"
   - "mark as bounced and remove from campaign"
   - "ignore automated OOO and resume after return date"
   - etc.
`.trim();

    // 3. Call OpenAI with JSON schema
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a precise classifier for cold email replies. Always use the allowed enums.",
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "reply_intent",
          schema: {
            type: "object",
            properties: {
              intent: {
                type: "string",
                enum: [
                  "positive",
                  "neutral",
                  "negative",
                  "out_of_office",
                  "unsubscribe",
                  "bounce",
                  "spam",
                  "wrong_person",
                  "referral",
                  "not_sure",
                ],
              },
              sub_intent: { type: "string" },
              sentiment: {
                type: "string",
                enum: ["positive", "neutral", "negative"],
              },
              confidence: { type: "number" },
              reason: { type: "string" },
              suggested_action: { type: "string" },
            },
            required: [
              "intent",
              "sub_intent",
              "sentiment",
              "confidence",
              "reason",
              "suggested_action",
            ],
            additionalProperties: false,
          },
          strict: true,
        },
      },
    });

    const jsonPart = response.choices[0]?.message?.content ?? "{}";
    let parsed: ClassifierResult;

    try {
      parsed = JSON.parse(jsonPart) as ClassifierResult;
    } catch (e) {
      console.error("Failed to parse classifier JSON", e, jsonPart);
      return new Response("Classifier parse error", { status: 500 });
    }

    // Sanity clamp
    const confidence = Math.min(Math.max(parsed.confidence ?? 0, 0), 1);

    // 4. Write back to DB
    const { error: updateError } = await supabase
      .from("campaign_replies")
      .update({
        intent: parsed.intent,
        sub_intent: parsed.sub_intent,
        sentiment: parsed.sentiment,
        intent_confidence: confidence,
        classifier_version: CLASSIFIER_VERSION,
        classified_at: new Date().toISOString(),
        classifier_raw: parsed as unknown as Record<string, unknown>,
      })
      .eq("id", reply.id);

    if (updateError) {
      console.error("Failed to update reply intent:", updateError);
      return new Response("Failed to update reply", { status: 500 });
    }

    // 5. Load campaign to get workspace_id and campaign_leads to get campaign_lead_id and thread_summary
    let campaignLeadId: string | null = null;
    let threadSummary: string | null = null;
    let workspaceId: string | null = null;
    
    try {
      // Get workspace_id from campaign
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("workspace_id")
        .eq("id", reply.campaign_id)
        .single();
      
      if (campaign) {
        workspaceId = campaign.workspace_id;
      }

      // Get campaign_leads info
      const { data: cl } = await supabase
        .from("campaign_leads")
        .select("id, thread_summary")
        .eq("campaign_id", reply.campaign_id)
        .eq("lead_id", reply.lead_id)
        .maybeSingle();
      
      if (cl) {
        campaignLeadId = cl.id;
        threadSummary = cl.thread_summary;
      }
    } catch (err) {
      console.error("Failed to load campaign/campaign_leads:", err);
      // Continue - not fatal
    }

    // 6. Create speed-to-lead job if applicable (Block 8480)
    // Fire-and-forget: don't block the response if this fails
    if (campaignLeadId) {
      try {
        await maybeCreateSpeedToLeadJob({
          supabase,
          campaignId: reply.campaign_id,
          campaignLeadId,
          leadId: reply.lead_id,
          replyId: reply.id,
          intent: parsed.intent,
          sentiment: parsed.sentiment,
          threadSummary,
        });
      } catch (err) {
        console.error("Error creating speed-to-lead job:", err);
        // Continue - don't fail the classification if speed-to-lead fails
      }
    }

    // 7. Apply intent side effects (Block 8500) - Auto-suppression + status sync
    // Fire-and-forget: don't block the response if this fails
    if (campaignLeadId && workspaceId) {
      try {
        await applyIntentSideEffects(supabase, {
          campaign_id: reply.campaign_id,
          campaign_lead_id: campaignLeadId,
          lead_id: reply.lead_id,
          reply_id: reply.id,
          intent: parsed.intent,
          sentiment: parsed.sentiment,
          thread_summary: threadSummary,
          workspace_id: workspaceId,
        });
      } catch (err) {
        console.error("Error applying intent side effects:", err);
        // Continue - don't fail the classification if side effects fail
      }
    }

    // 8. Trigger apply-reply-intent (Block 8350) to update campaign_leads status
    // Fire-and-forget: don't block the response if this fails
    try {
      const applyUrl =
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/apply-reply-intent`;

      await fetch(applyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ reply_id: reply.id }),
      }).catch((err) => {
        console.error("Failed to invoke apply-reply-intent:", err);
        // Don't throw - this is fire-and-forget
      });
    } catch (err) {
      console.error("Error calling apply-reply-intent:", err);
      // Continue - don't fail the classification if apply fails
    }

    return Response.json({
      status: "classified",
      reply_id: reply.id,
      intent: parsed.intent,
      sentiment: parsed.sentiment,
      confidence,
      suggested_action: parsed.suggested_action,
    });
  } catch (err) {
    console.error("Unhandled error in classify-reply:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});

