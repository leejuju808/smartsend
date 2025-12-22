// Block 19630 — Inbox AI Classifier & Lead Scoring Worker v1
// Edge Function that processes new inbox messages and classifies them with AI
// Runs as a background worker triggered by cron or webhook

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai";
import { createClient } from "npm:@supabase/supabase-js@2";

// ============================================================================
// SETUP
// ============================================================================

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables");
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Maximum number of messages to process per run
const MAX_BATCH_SIZE = 10;

// PART 4: AI Worker Hardening Constants
const AI_TIMEOUT_MS = 10000; // 10 seconds max
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_BASE_MS = 1000; // 1 second base

// ============================================================================
// TYPES
// ============================================================================

type AIIntent = "hot" | "warm" | "cold" | "dead" | "follow_up";

interface AIClassificationResult {
  intent: AIIntent;
  lead_score: number;
  reason: string;
  tags: string[];
  needs_follow_up_question: boolean;
  suggested_next_step: string;
  // Block 268300: “call notes” fields (optional; best-effort extraction)
  address?: string | null;
  issue_type?: string | null;
  urgency?: "critical" | "high" | "medium" | "low" | null;
}

interface MessageContext {
  message: {
    id: string;
    subject: string | null;
    body_clean: string | null;
    body_raw: string;
    from_email: string;
    received_at: string;
  };
  previous_messages: Array<{
    subject: string | null;
    body_clean: string | null;
    received_at: string;
  }> | null;
  contact: {
    city: string | null;
    state: string | null;
    roof_type_guess: string | null;
  } | null;
  campaign: {
    name: string | null;
    subject: string | null;
  } | null;
}

// ============================================================================
// PART 4: AI WORKER HARDENING - Validation & Timeout Helpers
// ============================================================================

/**
 * Validate AI classification result structure
 */
function validateClassificationResult(result: any): boolean {
  if (!result || typeof result !== 'object') {
    return false;
  }
  
  // Check required fields
  if (!result.intent || typeof result.intent !== 'string') {
    return false;
  }
  
  if (typeof result.lead_score !== 'number' || result.lead_score < 0 || result.lead_score > 100) {
    return false;
  }
  
  // Validate intent is one of allowed values
  const validIntents = ['hot', 'warm', 'cold', 'dead', 'follow_up'];
  if (!validIntents.includes(result.intent)) {
    return false;
  }
  
  return true;
}

/**
 * Create timeout promise
 */
function createTimeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`AI classification timeout after ${ms}ms`)), ms);
  });
}

/**
 * PART 4: Classify message with timeout and retry logic
 */
async function classifyMessageWithRetry(
  context: MessageContext,
  attempt: number = 1
): Promise<AIClassificationResult> {
  const startTime = Date.now();
  
  try {
    // Race between AI call and timeout
    const classificationPromise = classifyMessage(context);
    const timeoutPromise = createTimeoutPromise(AI_TIMEOUT_MS);
    
    const result = await Promise.race([classificationPromise, timeoutPromise]);
    
    // Validate result
    if (!validateClassificationResult(result)) {
      throw new Error('Invalid classification result structure');
    }
    
    const latency = Date.now() - startTime;
    console.log(`AI classification completed in ${latency}ms (attempt ${attempt})`);
    
    return result;
  } catch (error) {
    const latency = Date.now() - startTime;
    console.error(`AI classification failed (attempt ${attempt}/${MAX_RETRY_ATTEMPTS}) after ${latency}ms:`, error);
    
    // Retry with exponential backoff
    if (attempt < MAX_RETRY_ATTEMPTS) {
      const backoffMs = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      console.log(`Retrying in ${backoffMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      return classifyMessageWithRetry(context, attempt + 1);
    }
    
    // Max retries reached - return fallback
    console.error(`Max retries reached, using fallback classification`);
    return {
      intent: 'warm',
      lead_score: 50,
      reason: `AI classification failed after ${MAX_RETRY_ATTEMPTS} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`,
      tags: [],
      needs_follow_up_question: false,
      suggested_next_step: 'Review message manually - AI classification failed',
    };
  }
}

// ============================================================================
// AI CLASSIFICATION
// ============================================================================

async function classifyMessage(context: MessageContext): Promise<AIClassificationResult> {
  const { message, previous_messages, contact, campaign } = context;
  
  // Build conversation history
  const conversationHistory = previous_messages
    ? previous_messages
        .reverse()
        .map((msg) => `Previous: ${msg.subject || "(no subject)"}\n${msg.body_clean || ""}`)
        .join("\n\n---\n\n")
    : "";
  
  const currentMessage = `Subject: ${message.subject || "(no subject)"}\n\n${message.body_clean || message.body_raw}`;
  
  // Build context string
  const contactInfo = contact
    ? `Contact Location: ${contact.city || "Unknown"}, ${contact.state || "Unknown"}. Roof Type: ${contact.roof_type_guess || "Unknown"}.`
    : "Contact Location: Unknown.";
  
  const campaignInfo = campaign
    ? `Campaign: ${campaign.name || "Unknown"}. Campaign Subject: ${campaign.subject || "N/A"}.`
    : "";
  
  const systemPrompt = `You are an AI classifier for a roofing contractor's inbox system.

Your job is to analyze homeowner replies and classify their intent, urgency, and likelihood to become a paying customer.

CLASSIFICATION RULES:

**Hot (80-100 score):**
- Direct ask: "Need a quote", "When can you come out?", "I need an estimate"
- Mentions active leak, storm damage, urgent timeline ("ASAP", "this week", "immediately")
- Insurance claim active or adjuster coming soon
- Clear buying signals: "ready to move forward", "let's schedule"

**Warm (50-79 score):**
- Asks questions about services, pricing, availability
- Comparing contractors, "thinking about replacing"
- Budget discussions, "what would this cost?"
- Interested but no immediate urgency

**Cold (20-49 score):**
- Vague responses, no clear project or timeline
- "Maybe later", "not right now", "just browsing"
- Generic thanks without engagement

**Dead (0-19 score):**
- "Not interested", "remove me", "wrong address"
- Unsubscribe requests
- Negative responses

**Follow-Up Needed:**
- They answered partially or asked a question that requires owner response
- Needs clarification or more information
- Set needs_follow_up_question = true

ROOFING KEYWORDS TO EXTRACT:
Look for terms like: leak, storm, damage, insurance, claim, adjuster, shingles, missing, hail, wind, roof age, replacement, repair, emergency, urgent, timeline, quote, estimate, inspection, schedule, availability, budget, cost, price, comparing, thinking about, not interested, remove, unsubscribe.

Return a JSON object with this exact structure:
{
  "intent": "hot" | "warm" | "cold" | "dead" | "follow_up",
  "lead_score": <integer 0-100>,
  "reason": "<short explanation of classification>",
  "tags": ["array", "of", "roofing", "keywords"],
  "needs_follow_up_question": <boolean>,
  "suggested_next_step": "<short text for the owner, e.g., 'Call ASAP - active leak mentioned' or 'Send quote and availability' or 'Follow up in 24 hours' or 'Archive - not interested'>",

  "address": "<ONLY if homeowner provided an address or cross-street; else null>",
  "issue_type": "<one of: leak | storm_damage | repair | replacement | inspection | insurance_claim | gutters | other>",
  "urgency": "<one of: critical | high | medium | low | null>"
}`;

  const userPrompt = `${contactInfo}
${campaignInfo}

${conversationHistory ? `CONVERSATION HISTORY:\n${conversationHistory}\n\n` : ""}CURRENT MESSAGE:\n${currentMessage}

Analyze this message and return the classification JSON.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1, // Low temperature for consistent classification
      response_format: { type: "json_object" },
      max_tokens: 500,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const result = JSON.parse(content) as AIClassificationResult;
    
    // Validate and normalize result
    if (!["hot", "warm", "cold", "dead", "follow_up"].includes(result.intent)) {
      result.intent = "warm"; // Default fallback
    }
    
    result.lead_score = Math.max(0, Math.min(100, Math.round(result.lead_score || 50)));
    result.tags = Array.isArray(result.tags) ? result.tags : [];
    result.needs_follow_up_question = Boolean(result.needs_follow_up_question);
    result.reason = result.reason || "No reason provided";
    result.suggested_next_step = result.suggested_next_step || "Review message";

    // Block 268300: normalize call-notes fields
    const normalizeText = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const addr = normalizeText(result.address);
    result.address = addr && addr.length <= 180 ? addr : null;

    const issue = normalizeText(result.issue_type).toLowerCase();
    const allowedIssue = new Set([
      "leak",
      "storm_damage",
      "repair",
      "replacement",
      "inspection",
      "insurance_claim",
      "gutters",
      "other",
    ]);
    result.issue_type = allowedIssue.has(issue) ? issue : (issue ? "other" : null);

    const urg = normalizeText(result.urgency).toLowerCase() as any;
    const allowedUrgency = new Set(["critical", "high", "medium", "low"]);
    result.urgency = allowedUrgency.has(urg) ? urg : null;

    return result;
  } catch (error) {
    console.error("Error classifying message:", error);
    // Return safe defaults on error
    return {
      intent: "warm",
      lead_score: 50,
      reason: `Classification error: ${error instanceof Error ? error.message : "Unknown error"}`,
      tags: [],
      needs_follow_up_question: false,
      suggested_next_step: "Review message manually",
    };
  }
}

// ============================================================================
// MESSAGE PROCESSING
// ============================================================================

async function processMessage(messageId: string): Promise<void> {
  const processingStartTime = new Date().toISOString();
  let attemptCount = 0;
  
  try {
    // PART 4: Mark processing started
    await supabase
      .from("inbox_messages")
      .update({
        ai_processing_started_at: processingStartTime,
        ai_processing_attempts: 0,
      })
      .eq("id", messageId);

    // Get message context using the database function
    const { data: context, error: contextError } = await supabase.rpc(
      "get_message_context_for_ai",
      { p_message_id: messageId }
    );

    if (contextError || !context) {
      console.error(`Error fetching context for message ${messageId}:`, contextError);
      // Mark as processed with defaults to avoid retrying forever
      await supabase
        .from("inbox_messages")
        .update({
          ai_raw: { error: contextError?.message || "Context fetch failed" },
          ai_processing_completed_at: new Date().toISOString(),
          ai_processing_last_error: contextError?.message || "Context fetch failed",
        })
        .eq("id", messageId);
      return;
    }

    const messageContext = context as MessageContext;

    // PART 4: Classify with AI using retry logic and timeout
    const classification = await classifyMessageWithRetry(messageContext, 1);
    
    // Get current attempt count
    const { data: currentMessage } = await supabase
      .from("inbox_messages")
      .select("ai_processing_attempts")
      .eq("id", messageId)
      .single();
    
    attemptCount = (currentMessage?.ai_processing_attempts || 0) + 1;

    // Calculate follow-up due date (24 hours from now if needed)
    const followupDueAt = classification.needs_follow_up_question
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : null;

    // PART 4: Update message with classification results (with validation)
    const processingCompletedAt = new Date().toISOString();
    const aiRaw = {
      model: "gpt-4o-mini",
      classification,
      processed_at: processingCompletedAt,
      attempts: attemptCount,
    };
    
    // Validate using database function
    const { data: isValid } = await supabase.rpc('validate_ai_classification', {
      p_ai_raw: aiRaw,
    });
    
    if (!isValid) {
      console.error(`Invalid classification result for message ${messageId}, using fallback`);
      // Use fallback values
      classification.intent = 'warm';
      classification.lead_score = 50;
      classification.reason = 'AI classification validation failed - using fallback';
    }
    
    const { error: updateError } = await supabase
      .from("inbox_messages")
      .update({
        ai_intent: classification.intent,
        lead_score: classification.lead_score,
        ai_reason: classification.reason,
        ai_tags: classification.tags,
        needs_follow_up: classification.needs_follow_up_question,
        followup_due_at: followupDueAt,
        ai_raw: aiRaw,
        ai_processing_attempts: attemptCount,
        ai_processing_completed_at: processingCompletedAt,
        ai_processing_timeout: false,
        updated_at: processingCompletedAt,
      })
      .eq("id", messageId);

    if (updateError) {
      console.error(`Error updating message ${messageId}:`, updateError);
      throw updateError;
    }

    // The trigger will automatically update the thread metadata
    console.log(`Processed message ${messageId}: ${classification.intent} (${classification.lead_score}) after ${attemptCount} attempt(s)`);

    // ------------------------------------------------------------------------
    // Block 268300: Auto-generated “call notes” (address, issue, urgency)
    // ------------------------------------------------------------------------
    try {
      const { data: msgRow } = await supabase
        .from("inbox_messages")
        .select("thread_id")
        .eq("id", messageId)
        .maybeSingle();

      const threadId = (msgRow as any)?.thread_id as string | undefined;
      if (threadId) {
        const hasAnyCallNotes = Boolean(classification.address || classification.issue_type || classification.urgency);
        if (hasAnyCallNotes) {
          const nowIso = new Date().toISOString();

          await supabase
            .from("inbox_threads")
            .update({
              call_notes_address: classification.address ?? null,
              call_notes_issue_type: classification.issue_type ?? null,
              call_notes_urgency: classification.urgency ?? null,
              call_notes_generated_at: nowIso,
            } as any)
            .eq("id", threadId);

          // Best-effort: if address was provided and contact address is empty, fill it once.
          if (classification.address) {
            const { data: thread } = await supabase
              .from("inbox_threads")
              .select("contact_id")
              .eq("id", threadId)
              .maybeSingle();

            const contactId = (thread as any)?.contact_id as string | null | undefined;
            if (contactId) {
              const { data: contact } = await supabase
                .from("contacts")
                .select("address")
                .eq("id", contactId)
                .maybeSingle();

              const existingAddr = String((contact as any)?.address || "").trim();
              if (!existingAddr) {
                await supabase
                  .from("contacts")
                  .update({ address: classification.address } as any)
                  .eq("id", contactId);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Block 268300 call-notes update failed (non-blocking):", e);
    }
  } catch (error) {
    console.error(`Error processing message ${messageId}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // PART 4: Store error with retry tracking
    const { data: currentMessage } = await supabase
      .from("inbox_messages")
      .select("ai_processing_attempts, ai_processing_max_attempts")
      .eq("id", messageId)
      .single();
    
    const currentAttempts = (currentMessage?.ai_processing_attempts || 0) + 1;
    const maxAttempts = currentMessage?.ai_processing_max_attempts || MAX_RETRY_ATTEMPTS;
    const shouldRetry = currentAttempts < maxAttempts;
    
    await supabase
      .from("inbox_messages")
      .update({
        ai_raw: {
          error: errorMessage,
          processed_at: new Date().toISOString(),
          attempts: currentAttempts,
        },
        ai_processing_attempts: currentAttempts,
        ai_processing_last_error: errorMessage,
        ai_processing_timeout: errorMessage.includes('timeout'),
        ai_processing_completed_at: shouldRetry ? null : new Date().toISOString(), // Keep null if retrying
      })
      .eq("id", messageId);
    
    // If max attempts reached, apply fallback classification
    if (!shouldRetry) {
      await supabase
        .from("inbox_messages")
        .update({
          ai_intent: 'warm',
          lead_score: 50,
          ai_reason: `AI classification failed after ${maxAttempts} attempts: ${errorMessage}`,
          ai_tags: [],
          needs_follow_up: false,
        })
        .eq("id", messageId);
    }
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  // Allow cron secret for scheduled runs
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const runStartTime = Date.now();
  const errorLog: any[] = [];
  
  try {
    // PART 4: Find messages that need AI processing
    // (messages with default values: ai_intent='warm', lead_score=50, and ai_reason is NULL)
    // OR messages that failed but haven't exceeded max attempts
    const { data: messages, error: fetchError } = await supabase
      .from("inbox_messages")
      .select("id, ai_processing_attempts, ai_processing_max_attempts")
      .eq("direction", "inbound")
      .eq("ai_intent", "warm")
      .eq("lead_score", 50)
      .is("ai_reason", null)
      .or("ai_processing_attempts.is.null,ai_processing_attempts.lt.ai_processing_max_attempts")
      .order("created_at", { ascending: true })
      .limit(MAX_BATCH_SIZE);

    if (fetchError) {
      console.error("Error fetching messages:", fetchError);
      return new Response(
        JSON.stringify({ ok: false, error: fetchError.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No messages to process" }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Process messages in parallel (with concurrency limit)
    const results = await Promise.allSettled(
      messages.map((msg) => processMessage(msg.id))
    );

    const processed = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    
    // PART 4: Collect errors for monitoring
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        errorLog.push({
          message_id: messages[index]?.id,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
    
    const runDuration = Date.now() - runStartTime;
    const averageLatency = processed > 0 ? Math.round(runDuration / processed) : null;
    
    // PART 5: Log AI worker health
    await supabase.rpc('log_ai_worker_health', {
      p_worker_type: 'inbox-ai-classifier',
      p_messages_processed: processed,
      p_messages_failed: failed,
      p_queue_length: messages.length - processed - failed, // Remaining in queue
      p_average_latency_ms: averageLatency,
      p_error_log: errorLog,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        failed,
        total: messages.length,
        average_latency_ms: averageLatency,
        run_duration_ms: runDuration,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in inbox-ai-classifier-worker:", error);
    
    // PART 5: Log error to monitoring
    await supabase.rpc('log_ai_worker_health', {
      p_worker_type: 'inbox-ai-classifier',
      p_messages_processed: 0,
      p_messages_failed: 0,
      p_queue_length: 0,
      p_error_log: [{
        error: error instanceof Error ? error.message : String(error),
        type: 'worker_error',
      }],
    });
    
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

