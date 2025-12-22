import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

interface ClassificationResult {
  intent: "hot" | "warm" | "neutral" | "not_interested" | "unsubscribe" | "spam" | "bounce";
  summary: string;
  next_action: "book" | "answer" | "stop" | "info_needed" | "none";
  confidence?: number;
}

/**
 * POST /api/ai/reply-classify
 * 
 * Classifies an inbound email reply using AI and updates the message and lead stats.
 * 
 * Request body:
 * {
 *   "message_id": "uuid",
 *   "text": "full_email_text",
 *   "account_id": "uuid",
 *   "campaign_id": "uuid",
 *   "contact_id": "uuid"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message_id, text, account_id, campaign_id, contact_id } = body;

    if (!message_id || !text) {
      return NextResponse.json(
        { error: "message_id and text are required" },
        { status: 400 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get message details if not provided
    let finalAccountId = account_id;
    let finalCampaignId = campaign_id;
    let finalContactId = contact_id;

    if (!finalAccountId || !finalCampaignId || !finalContactId) {
      const { data: message, error: msgError } = await supabase
        .from("messages")
        .select("account_id, campaign_id, contact_id, body_text")
        .eq("id", message_id)
        .single();

      if (msgError || !message) {
        return NextResponse.json(
          { error: "Message not found" },
          { status: 404 }
        );
      }

      finalAccountId = finalAccountId || message.account_id;
      finalCampaignId = finalCampaignId || message.campaign_id;
      finalContactId = finalContactId || message.contact_id;
    }

    // Clean the text (strip signatures, quoted replies)
    const cleanedText = cleanEmailText(text);

    if (!cleanedText || cleanedText.trim().length === 0) {
      return NextResponse.json(
        { error: "No text content after cleaning" },
        { status: 400 }
      );
    }

    // Classify using OpenAI
    const classification = await classifyWithOpenAI(cleanedText);

    // Update message with classification results
    const { error: updateError } = await supabase
      .from("messages")
      .update({
        intent: classification.intent,
        reply_summary: classification.summary,
        reply_next_action: classification.next_action,
        ai_confidence: classification.confidence || 0.0,
      })
      .eq("id", message_id);

    if (updateError) {
      console.error("Error updating message:", updateError);
      return NextResponse.json(
        { error: "Failed to update message", details: updateError.message },
        { status: 500 }
      );
    }

    // Process classification and update lead stats using database function
    if (finalAccountId && finalCampaignId && finalContactId) {
      const { error: processError } = await supabase.rpc("process_reply_classification", {
        p_message_id: message_id,
        p_intent: classification.intent,
        p_summary: classification.summary,
        p_next_action: classification.next_action,
        p_confidence: classification.confidence || 0.0,
      });

      if (processError) {
        console.error("Error processing classification:", processError);
        // Don't fail the request, just log it
      }

      // Trigger follow-up brain logic
      await triggerFollowUpBrain(
        supabase,
        finalAccountId,
        finalCampaignId,
        finalContactId,
        classification.intent,
        message_id
      );
    }

    return NextResponse.json({
      success: true,
      classification: {
        intent: classification.intent,
        summary: classification.summary,
        next_action: classification.next_action,
        confidence: classification.confidence,
      },
    });
  } catch (error) {
    console.error("Error in reply-classify:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Clean email text by removing signatures, quoted replies, etc.
 */
function cleanEmailText(text: string): string {
  if (!text) return "";

  let cleaned = text;

  // Remove common email signatures (lines starting with --, ---)
  cleaned = cleaned.replace(/^--.*$/gm, "");
  cleaned = cleaned.replace(/^---.*$/gm, "");

  // Remove quoted replies (lines starting with >)
  cleaned = cleaned.replace(/^>.*$/gm, "");

  // Remove "On [date] [person] wrote:" patterns
  cleaned = cleaned.replace(/On .* wrote:.*$/gm, "");

  // Remove "From:" patterns in quoted sections
  cleaned = cleaned.replace(/^From:.*$/gm, "");

  // Remove "Sent from" patterns
  cleaned = cleaned.replace(/Sent from.*$/gm, "");

  // Remove multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // Trim whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Classify reply using OpenAI
 */
async function classifyWithOpenAI(text: string): Promise<ClassificationResult> {
  const prompt = `You are Reply-AI for a roofing company outreach system.

Given this reply from a homeowner, classify it into one of the following:
- hot
- warm
- neutral
- not_interested
- unsubscribe
- spam
- bounce

Provide:
1. "intent": category
2. "summary": short summary in plain language (roofing-style)
3. "next_action": one of:
   - "book" (if they want to schedule)
   - "answer" (if they need info/questions)
   - "stop" (if not interested or unsubscribe)
   - "info_needed" (if they're asking for information)
   - "none" (spam or bounce)

Keep summary under 1 sentence.
Do not rewrite their message — summarize it.

Homeowner reply:
${text.slice(0, 4000)}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a reply classification system for a roofing company. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content from OpenAI");
    }

    const parsed = JSON.parse(content);

    // Validate and normalize intent
    const validIntents = [
      "hot",
      "warm",
      "neutral",
      "not_interested",
      "unsubscribe",
      "spam",
      "bounce",
    ];
    const intent = validIntents.includes(parsed.intent?.toLowerCase())
      ? (parsed.intent.toLowerCase() as ClassificationResult["intent"])
      : "neutral";

    // Validate and normalize next_action
    const validActions = ["book", "answer", "stop", "info_needed", "none"];
    const next_action = validActions.includes(parsed.next_action?.toLowerCase())
      ? (parsed.next_action.toLowerCase() as ClassificationResult["next_action"])
      : intent === "hot"
      ? "book"
      : intent === "warm" || intent === "neutral"
      ? "answer"
      : intent === "not_interested" || intent === "unsubscribe"
      ? "stop"
      : "none";

    // Ensure summary exists and is reasonable length
    let summary = parsed.summary || "No summary available";
    if (summary.length > 200) {
      summary = summary.slice(0, 197) + "...";
    }

    // Extract confidence if provided
    const confidence =
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : undefined;

    return {
      intent,
      summary,
      next_action,
      confidence,
    };
  } catch (error) {
    console.error("Error classifying with OpenAI:", error);
    // Fallback to neutral classification
    return {
      intent: "neutral",
      summary: "Unable to classify reply",
      next_action: "answer",
      confidence: 0.3,
    };
  }
}

/**
 * Trigger follow-up brain logic based on intent
 */
async function triggerFollowUpBrain(
  supabase: ReturnType<typeof createClient>,
  account_id: string,
  campaign_id: string,
  contact_id: string,
  intent: string,
  message_id: string
) {
  try {
    // Call the follow-up brain handler
    // This matches the logic from Block 8880
    const normalizedIntent = intent.toLowerCase();

    // Stop follow-ups for hot leads (positive intent)
    if (normalizedIntent === "hot") {
      await supabase
        .from("lead_auto_follow_up_stats")
        .update({ auto_follow_up_disabled: true })
        .eq("campaign_id", campaign_id)
        .eq("contact_id", contact_id);

      // Log event
      await supabase.from("follow_up_events").insert({
        account_id,
        campaign_id,
        contact_id,
        message_id,
        event_type: "stopped_by_positive_intent",
        details: {
          intent,
          reason: "Hot lead - stop all follow-ups",
        },
      });
    }

    // Stop follow-ups and suppress for unsubscribe
    if (normalizedIntent === "unsubscribe") {
      await supabase
        .from("lead_auto_follow_up_stats")
        .update({ auto_follow_up_disabled: true })
        .eq("campaign_id", campaign_id)
        .eq("contact_id", contact_id);

      // Get contact email for suppression
      const { data: contact } = await supabase
        .from("contacts")
        .select("email")
        .eq("id", contact_id)
        .single();

      if (contact?.email) {
        // Add to suppression list
        await supabase.from("suppression_list").upsert(
          {
            account_id,
            email: contact.email.toLowerCase(),
            scope: "account",
            reason: "unsubscribe",
            source: "reply_ai",
          },
          {
            onConflict: "account_id,scope,campaign_id,email",
          }
        );

        await supabase.from("suppression_list").upsert(
          {
            account_id,
            campaign_id,
            email: contact.email.toLowerCase(),
            scope: "campaign",
            reason: "unsubscribe",
            source: "reply_ai",
          },
          {
            onConflict: "account_id,scope,campaign_id,email",
          }
        );
      }

      // Log event
      await supabase.from("follow_up_events").insert({
        account_id,
        campaign_id,
        contact_id,
        message_id,
        event_type: "stopped_by_negative_intent",
        details: {
          intent,
          reason: "Unsubscribe - stop and suppress",
          added_to_suppression: true,
        },
      });
    }

    // Stop follow-ups for not_interested
    if (normalizedIntent === "not_interested") {
      await supabase
        .from("lead_auto_follow_up_stats")
        .update({ auto_follow_up_disabled: true })
        .eq("campaign_id", campaign_id)
        .eq("contact_id", contact_id);

      // Log event
      await supabase.from("follow_up_events").insert({
        account_id,
        campaign_id,
        contact_id,
        message_id,
        event_type: "stopped_by_negative_intent",
        details: {
          intent,
          reason: "Not interested - stop follow-ups",
        },
      });
    }

    // For spam, just log but don't change stats (except inbound timestamp)
    if (normalizedIntent === "spam") {
      await supabase.from("follow_up_events").insert({
        account_id,
        campaign_id,
        contact_id,
        message_id,
        event_type: "stopped_by_negative_intent",
        details: {
          intent,
          reason: "Spam detected - ignore",
        },
      });
    }
  } catch (error) {
    console.error("Error triggering follow-up brain:", error);
    // Don't throw - this is best-effort
  }
}
























































