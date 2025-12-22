// Block 259 — Smart Reply Classification v2
// Multi-Label Tagging, Confidence Scores, Edge-Case Buckets, Training Signals

// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const SYSTEM_PROMPT = `You are SmartSend's enterprise reply classifier.

Return a JSON object with:
- primary_intent: one of the primary labels below
- labels: array of {label, confidence, metadata?} objects

Primary labels:
- meeting_intent
- interested
- not_interested
- neutral
- ambiguous

Secondary labels:
- pricing_interest
- objection_budget
- objection_timing
- objection_need
- follow_up_requested
- referral
- forwarded
- spam_complaint
- unsubscribe
- ooo
- autoresponder
- wrong_person

Other labels:
- time_proposed (extract meeting time in metadata.datetime as ISO 8601)
- request_details
- technical_question

Rules:
- Output JSON only.
- Never add hallucinated times.
- Always include primary_intent.
- Include all applicable labels with confidence scores (0-1).
- For time_proposed, extract exact datetime with timezone guess if user proposes a time.
- If unclear about time, return null in metadata.datetime.
- Detect edge cases: unsubscribe, OOO, forwarded, spam complaint, auto-reply.`;

type LabelResult = {
  label: string;
  confidence: number;
  metadata?: {
    datetime?: string;
    [key: string]: any;
  };
};

type ClassificationResult = {
  primary_intent: string;
  labels: LabelResult[];
};

function buildPrompt(message: any): string {
  const subject = message.subject || "";
  const body = message.body_text || message.body_html || "";
  const text = `${subject}\n\n${body}`.trim();
  
  return `Classify this email reply:

Subject: ${subject}

Body:
${text.slice(0, 5000)}

Return JSON with primary_intent and labels array.`;
}

async function classifyWithOpenAI(text: string, subject?: string): Promise<ClassificationResult> {
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
  
  try {
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt({ subject, body_text: text }) }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content from OpenAI");
    }

    const parsed = JSON.parse(content);
    
    // Ensure primary_intent exists
    if (!parsed.primary_intent) {
      parsed.primary_intent = parsed.labels?.[0]?.label || "neutral";
    }

    // Ensure labels array exists
    if (!Array.isArray(parsed.labels)) {
      parsed.labels = [{ label: parsed.primary_intent, confidence: 0.5 }];
    }

    return parsed as ClassificationResult;
  } catch (error) {
    console.error("OpenAI classification error:", error);
    // Fallback to neutral
    return {
      primary_intent: "neutral",
      labels: [{ label: "neutral", confidence: 0.3 }]
    };
  }
}

async function saveClassificationResults(
  threadId: string,
  messageId: string,
  result: ClassificationResult
): Promise<void> {
  // 1. Insert into reply_labels (per label)
  const labelInserts = result.labels.map((label) => ({
    thread_id: threadId,
    message_id: messageId,
    label: label.label,
    confidence: label.confidence,
    metadata: label.metadata || {}
  }));

  if (labelInserts.length > 0) {
    const { error: labelsError } = await supabase
      .from("reply_labels")
      .insert(labelInserts);
    
    if (labelsError) {
      console.error("Error inserting reply_labels:", labelsError);
    }
  }

  // 2. Update reply_threads
  const labelStrings = result.labels.map((l) => l.label);
  const secondaryLabels = result.labels
    .filter((l) => 
      ["pricing_interest", "objection_budget", "objection_timing", "objection_need", 
       "follow_up_requested", "referral"].includes(l.label)
    )
    .map((l) => l.label);
  
  const maxConfidence = Math.max(...result.labels.map((l) => l.confidence), 0);

  const { error: threadError } = await supabase
    .from("reply_threads")
    .update({
      labels: labelStrings,
      intent_secondary: secondaryLabels,
      intent_primary: result.primary_intent,
      model_confidence: maxConfidence,
      last_label: result.primary_intent,
      updated_at: new Date().toISOString()
    })
    .eq("id", threadId);

  if (threadError) {
    console.error("Error updating reply_threads:", threadError);
  }

  // 3. Save training sample
  const { data: message } = await supabase
    .from("messages")
    .select("body_text, body_html, subject")
    .eq("id", messageId)
    .single();

  if (message) {
    const rawText = `${message.subject || ""}\n\n${message.body_text || message.body_html || ""}`;
    
    await supabase.from("training_samples").insert({
      thread_id: threadId,
      message_id: messageId,
      raw_text: rawText,
      labels: result.labels
    });
  }
}

async function triggerIntegrations(
  threadId: string,
  leadId: string | null,
  result: ClassificationResult
): Promise<void> {
  const labelSet = new Set(result.labels.map((l) => l.label));
  const primaryIntent = result.primary_intent;

  // Block 273: Update lead score for reply
  if (leadId) {
    try {
      const { data: leadData } = await supabase
        .from("leads")
        .select("workspace_id")
        .eq("id", leadId)
        .single();

      if (leadData?.workspace_id) {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        // Trigger scoring for reply
        await fetch(`${SUPABASE_URL}/functions/v1/lead-score-v1`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            lead_id: leadId,
            event_type: "reply",
            workspace_id: leadData.workspace_id,
          }),
        }).catch((err) => {
          console.warn("Failed to update lead score for reply:", err);
        });

        // If meeting intent, also trigger meeting_intent scoring
        if (primaryIntent === "meeting_intent") {
          await fetch(`${SUPABASE_URL}/functions/v1/lead-score-v1`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              lead_id: leadId,
              event_type: "meeting_intent",
              workspace_id: leadData.workspace_id,
            }),
          }).catch((err) => {
            console.warn("Failed to update lead score for meeting intent:", err);
          });
        }
      }
    } catch (e) {
      console.warn("Error updating lead score:", e);
    }
  }

  // A. Deal Auto-Creation (Block 254)
  if (leadId && (primaryIntent === "meeting_intent" || primaryIntent === "interested")) {
    try {
      const { data: threadData } = await supabase
        .from("reply_threads")
        .select("account_id, owner_id")
        .eq("id", threadId)
        .single();

      if (threadData) {
        const { error: dealError } = await supabase.rpc("auto_create_deal_from_intent", {
          p_lead_id: leadId,
          p_intent_primary: primaryIntent,
          p_workspace_id: null,
          p_owner_id: threadData.owner_id
        });

        if (dealError) {
          console.warn("Failed to auto-create deal:", dealError);
        }
      }
    } catch (e) {
      console.warn("Error in deal auto-creation:", e);
    }
  }

  // Block 281: Create Meeting from Intent
  if (leadId && primaryIntent === "meeting_intent") {
    try {
      // Get lead and thread data
      const { data: leadData } = await supabase
        .from("leads")
        .select("workspace_id")
        .eq("id", leadId)
        .single();

      const { data: threadData } = await supabase
        .from("reply_threads")
        .select("account_id, owner_id")
        .eq("id", threadId)
        .single();

      if (leadData?.workspace_id && threadData) {
        // Extract datetime from time_proposed label
        const timeProposedLabel = result.labels.find((l) => l.label === "time_proposed");
        const datetimeStr = timeProposedLabel?.metadata?.datetime;
        
        let startTime: string | null = null;
        let endTime: string | null = null;
        let timezone: string | null = null;
        let confidence = Math.round((timeProposedLabel?.confidence || 0.7) * 100);

        if (datetimeStr) {
          try {
            const parsedDate = new Date(datetimeStr);
            if (!isNaN(parsedDate.getTime())) {
              startTime = parsedDate.toISOString();
              // Default 30 minute duration
              const endDate = new Date(parsedDate.getTime() + 30 * 60 * 1000);
              endTime = endDate.toISOString();
              // Try to extract timezone from datetime string or use UTC
              timezone = parsedDate.toTimeString().includes("GMT") ? "UTC" : null;
            }
          } catch (e) {
            console.warn("Failed to parse datetime:", e);
          }
        }

        // Get raw text from message for context
        const { data: messageData } = await supabase
          .from("messages")
          .select("body_text, body_html, subject")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const rawText = messageData 
          ? `${messageData.subject || ""}\n\n${messageData.body_text || messageData.body_html || ""}`.trim()
          : null;

        // Create meeting
        const { data: meetingId, error: meetingError } = await supabase.rpc("create_meeting_from_intent", {
          p_workspace_id: leadData.workspace_id,
          p_lead_id: leadId,
          p_thread_id: threadId,
          p_owner_id: threadData.owner_id,
          p_start_time: startTime,
          p_end_time: endTime,
          p_timezone: timezone,
          p_confidence: confidence,
          p_raw_text: rawText,
          p_title: null
        });

        if (meetingError) {
          console.warn("Failed to create meeting:", meetingError);
        } else {
          console.log("Meeting created:", meetingId);
          
          // Send notification to owner (Block 268)
          if (threadData.owner_id) {
            try {
              const { data: lead } = await supabase
                .from("leads")
                .select("first_name, last_name, company")
                .eq("id", leadId)
                .single();

              const leadName = lead 
                ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || lead.company || "Lead"
                : "Lead";

              const timeStr = startTime 
                ? new Date(startTime).toLocaleString("en-US", { 
                    weekday: "short", 
                    month: "short", 
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZoneName: "short"
                  })
                : "Time TBD";

              await supabase.rpc("log_team_activity", {
                p_workspace_id: leadData.workspace_id,
                p_user_id: threadData.owner_id,
                p_lead_id: leadId,
                p_type: "meeting_scheduled",
                p_title: `🗓️ New meeting detected with ${leadName}`,
                p_body: `Meeting scheduled — ${timeStr}`,
                p_metadata: { meeting_id: meetingId }
              }).catch((err) => {
                console.warn("Failed to log notification:", err);
              });
            } catch (notifErr) {
              console.warn("Error sending notification:", notifErr);
            }
          }
        }
      }
    } catch (e) {
      console.warn("Error in meeting creation:", e);
    }
  }

  // Helper function to pause follow-ups for a lead
  async function pauseFollowupsForLead(leadId: string | null, campaignId: string | null, reason: string, until?: string) {
    if (!leadId) return;

    // Pause followup_tasks
    await supabase
      .from("followup_tasks")
      .update({ paused: true, paused_at: new Date().toISOString() })
      .eq("lead_id", leadId)
      .eq("done", false)
      .catch(() => {});

    // Update campaign_leads if campaign_id exists
    if (campaignId) {
      await supabase
        .from("campaign_leads")
        .update({
          paused_at: new Date().toISOString(),
          pause_reason: reason,
          paused_until: until || null
        })
        .eq("campaign_id", campaignId)
        .eq("lead_id", leadId)
        .catch(() => {});
    }
  }

  // B. Handle unsubscribe
  if (labelSet.has("unsubscribe") || primaryIntent === "unsubscribe") {
    if (leadId) {
      // Add DNC tag
      const { data: lead } = await supabase
        .from("leads")
        .select("email")
        .eq("id", leadId)
        .single();

      if (lead?.email) {
        await supabase
          .from("suppressions_email")
          .upsert({ email: lead.email, reason: "unsubscribe" }, { onConflict: "email" })
          .catch(() => {});
      }

      // Pause follow-ups
      const { data: threadData } = await supabase
        .from("reply_threads")
        .select("campaign_id")
        .eq("id", threadId)
        .single();
      
      await pauseFollowupsForLead(leadId, threadData?.campaign_id || null, "unsubscribe");
    }
  }

  // C. Handle OOO
  if (labelSet.has("ooo") || primaryIntent === "ooo") {
    const oooDays = 7; // Default OOO days
    const returnAt = new Date(Date.now() + oooDays * 24 * 3600 * 1000).toISOString();
    
    if (leadId) {
      const { data: threadData } = await supabase
        .from("reply_threads")
        .select("campaign_id")
        .eq("id", threadId)
        .single();
      
      await pauseFollowupsForLead(leadId, threadData?.campaign_id || null, "ooo", returnAt);
    }
  }

  // D. Handle spam complaint
  if (labelSet.has("spam_complaint")) {
    if (leadId) {
      const { data: lead } = await supabase
        .from("leads")
        .select("email")
        .eq("id", leadId)
        .single();

      if (lead?.email) {
        await supabase
          .from("suppressions_email")
          .upsert({ email: lead.email, reason: "spam_complaint" }, { onConflict: "email" })
          .catch(() => {});
      }

      const { data: threadData } = await supabase
        .from("reply_threads")
        .select("campaign_id")
        .eq("id", threadId)
        .single();
      
      await pauseFollowupsForLead(leadId, threadData?.campaign_id || null, "spam_complaint");
    }
  }

  // E. Pause follow-ups for positive replies
  if (primaryIntent === "meeting_intent" || primaryIntent === "interested") {
    if (leadId) {
      const { data: threadData } = await supabase
        .from("reply_threads")
        .select("campaign_id")
        .eq("id", threadId)
        .single();
      
      await pauseFollowupsForLead(leadId, threadData?.campaign_id || null, "replied");
    }
  }
}

Deno.serve(async (req) => {
  try {
    const { message_id } = await req.json();
    
    if (!message_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_message_id" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Fetch message
    const { data: message, error: msgError } = await supabase
      .from("messages")
      .select("id, thread_id, lead_id, account_id, direction, from_email, to_email, subject, body_text, body_html, received_at")
      .eq("id", message_id)
      .maybeSingle();

    if (msgError || !message) {
      return new Response(
        JSON.stringify({ ok: false, error: "message_not_found" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    if (message.direction !== "inbound") {
      return new Response(
        JSON.stringify({ ok: true, skipped: "not_inbound" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    // Get thread
    const { data: thread } = await supabase
      .from("reply_threads")
      .select("id, account_id, lead_id, campaign_id")
      .eq("id", message.thread_id)
      .maybeSingle();

    if (!thread) {
      return new Response(
        JSON.stringify({ ok: false, error: "thread_not_found" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    // Build text for classification
    const text = `${message.subject || ""}\n\n${message.body_text || message.body_html || ""}`.trim();

    // Classify with OpenAI
    const result = await classifyWithOpenAI(text, message.subject);

    // Save results
    await saveClassificationResults(thread.id, message.id, result);

    // Trigger integrations
    await triggerIntegrations(thread.id, thread.lead_id || message.lead_id, result);

    return new Response(
      JSON.stringify({
        ok: true,
        primary_intent: result.primary_intent,
        labels: result.labels,
        thread_id: thread.id
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    console.error("Classification error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

