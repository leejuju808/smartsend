// Block 20990 — SmartSend Reply Classification Engine v2
// Deep Intent Detection • Insurance Awareness • Adjuster Language Parsing • Lead Heat Upgrade • Action Routing

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

// Classification categories
const HOMEOWNER_CATEGORIES = [
  "interested_wants_inspection",
  "interested_wants_estimate",
  "interested_ready_to_book",
  "interested_wants_to_move_forward",
  "insurance_claim_filed",
  "insurance_adjuster_scheduled",
  "insurance_needs_help_filing_claim",
  "insurance_claim_approved",
  "insurance_approval_attached",
  "insurance_asking_questions",
  "price_concern_objection",
  "not_interested_already_hired",
  "not_interested_no_damage",
  "not_interested_remove_me",
];

const ADJUSTER_CATEGORIES = [
  "adjuster_scheduled_appointment",
  "adjuster_requesting_photos",
  "adjuster_requesting_estimate",
  "adjuster_denied_supplement",
  "adjuster_pending_review",
  "adjuster_approved_supplement",
  "adjuster_asking_homeowner_info",
  "adjuster_sending_scope",
  "adjuster_adjusting_pricing",
  "adjuster_approved_claim",
];

const SYSTEM_PROMPT = `You are SmartSend's Reply Classification Engine v2 - the most advanced roofing and insurance intent detection system.

Your job is to classify homeowner and adjuster replies with DEEP understanding of:
- Roofing contractor workflows
- Insurance claim processes
- Adjuster communication patterns
- Homeowner buying signals

CLASSIFICATION CATEGORIES:

Homeowner Intent (14 categories):
1. interested_wants_inspection - Homeowner wants an inspection scheduled
2. interested_wants_estimate - Homeowner is asking for an estimate/quote
3. interested_ready_to_book - Homeowner says "let's get started", "when can we schedule", "ready to move forward"
4. interested_wants_to_move_forward - Similar to ready_to_book but less explicit
5. insurance_claim_filed - Homeowner mentions filing a claim
6. insurance_adjuster_scheduled - Homeowner mentions adjuster appointment scheduled
7. insurance_needs_help_filing_claim - Homeowner asking for help with claim filing
8. insurance_claim_approved - Homeowner says claim was approved
9. insurance_approval_attached - Homeowner attached approval letter/document
10. insurance_asking_questions - Homeowner asking insurance-related questions
11. price_concern_objection - Homeowner concerned about price/cost
12. not_interested_already_hired - Homeowner already hired someone else
13. not_interested_no_damage - Homeowner says no damage
14. not_interested_remove_me - Homeowner wants to unsubscribe/remove

Adjuster Intent (10 categories):
1. adjuster_scheduled_appointment - Adjuster scheduling appointment
2. adjuster_requesting_photos - Adjuster asking for photos
3. adjuster_requesting_estimate - Adjuster asking for contractor estimate
4. adjuster_denied_supplement - Adjuster denied supplement request
5. adjuster_pending_review - Adjuster says claim is pending review
6. adjuster_approved_supplement - Adjuster approved supplement
7. adjuster_asking_homeowner_info - Adjuster asking homeowner for information
8. adjuster_sending_scope - Adjuster sending scope of work
9. adjuster_adjusting_pricing - Adjuster adjusting pricing
10. adjuster_approved_claim - Adjuster approved the claim

EXTRACTION REQUIREMENTS:

For each message, extract ALL relevant data into extracted_data JSON:

From Homeowners:
- adjuster_name: Name of adjuster if mentioned
- carrier: Insurance carrier (State Farm, Allstate, etc.)
- claim_number: Claim number if mentioned
- adjuster_appointment_date: Date/time of adjuster appointment (ISO 8601)
- storm_damage_date: Date of storm damage if mentioned
- insurance_questions: Array of questions asked
- deductible_info: {amount: number, type: "fixed"|"percentage"}
- acv_rcv_language: {rcv: number, acv: number, depreciation: number} if mentioned
- approval_wording: Exact approval language if present
- ready_to_book_phrases: Array of phrases indicating readiness
- roof_type: Type of roof if mentioned
- location: Location of damage if mentioned

From Adjusters:
- missing_photos: boolean if photos are requested
- missing_documentation: Array of missing docs (e.g., ["scope", "estimate"])
- scope_pdf_detected: boolean if scope PDF mentioned
- approval_pdf_detected: boolean if approval PDF mentioned
- market_pricing_language: Pricing concerns if mentioned
- approval_denial_terms: "approved" or "denied" or null

Return JSON with:
{
  "classification": "one_of_the_categories_above",
  "confidence": 0.0-1.0,
  "extracted_data": {
    // All extracted fields above
  },
  "reasoning": "Brief explanation of classification"
}

Be VERY precise. This drives automation that affects revenue.`;

type ClassificationResult = {
  classification: string;
  confidence: number;
  extracted_data: Record<string, any>;
  reasoning?: string;
};

async function classifyWithOpenAI(
  text: string,
  subject: string | null,
  insuranceContext: Record<string, any> = {}
): Promise<ClassificationResult> {
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
  
  const contextPrompt = insuranceContext && Object.keys(insuranceContext).length > 0
    ? `\n\nINSURANCE CONTEXT FROM PREVIOUS MESSAGES:\n${JSON.stringify(insuranceContext, null, 2)}`
    : "";

  try {
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Classify this email reply:

Subject: ${subject || "(no subject)"}

Body:
${text.slice(0, 8000)}${contextPrompt}

Return JSON with classification, confidence (0-1), extracted_data, and reasoning.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content from OpenAI");
    }

    const parsed = JSON.parse(content);
    
    // Validate classification
    const validCategories = [...HOMEOWNER_CATEGORIES, ...ADJUSTER_CATEGORIES, "neutral", "ambiguous"];
    if (!validCategories.includes(parsed.classification)) {
      console.warn(`Invalid classification: ${parsed.classification}, defaulting to neutral`);
      parsed.classification = "neutral";
      parsed.confidence = 0.3;
    }

    return {
      classification: parsed.classification,
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
      extracted_data: parsed.extracted_data || {},
      reasoning: parsed.reasoning,
    };
  } catch (error) {
    console.error("OpenAI classification error:", error);
    return {
      classification: "neutral",
      confidence: 0.3,
      extracted_data: {},
      reasoning: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function getInsuranceContext(threadId: string): Promise<Record<string, any>> {
  try {
    const { data: thread } = await supabase
      .from("inbox_threads")
      .select(
        "insurance_carrier, insurance_claim_status, insurance_deductible_amount, insurance_payout_type, claim_financials, insurance_analysis_metadata"
      )
      .eq("id", threadId)
      .maybeSingle();

    if (!thread) {
      return {};
    }

    const context: Record<string, any> = {
      carrier: thread.insurance_carrier || null,
      claim_status: thread.insurance_claim_status || null,
      deductible: thread.insurance_deductible_amount || null,
      payout_type: thread.insurance_payout_type || null,
    };

    // Extract RCV/ACV from claim_financials if available
    if (thread.claim_financials) {
      const financials = typeof thread.claim_financials === "string"
        ? JSON.parse(thread.claim_financials)
        : thread.claim_financials;
      
      if (financials.rcv_total) {
        context.estimated_rcv = financials.rcv_total;
      }
      if (financials.acv_total) {
        context.estimated_acv = financials.acv_total;
      }
    }

    // Extract supplements from metadata
    if (thread.insurance_analysis_metadata) {
      const metadata = typeof thread.insurance_analysis_metadata === "string"
        ? JSON.parse(thread.insurance_analysis_metadata)
        : thread.insurance_analysis_metadata;
      
      if (metadata.supplements_detected) {
        context.supplements_detected = metadata.supplements_detected;
      }
    }

    return context;
  } catch (error) {
    console.error("Error getting insurance context:", error);
    return {};
  }
}

function normalizeText(plain?: string | null, html?: string | null): string {
  if (plain && plain.trim().length > 10) {
    return plain.trim();
  }
  if (html) {
    // Simple HTML stripping
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
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
      .select(
        "id, thread_id, lead_id, account_id, direction, from_email, to_email, subject, body_text, body_html, received_at"
      )
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

    // Get thread (try both reply_threads and inbox_threads)
    let thread: any = null;
    
    const { data: replyThread } = await supabase
      .from("reply_threads")
      .select("id, account_id, lead_id, campaign_id")
      .eq("id", message.thread_id)
      .maybeSingle();

    if (replyThread) {
      thread = replyThread;
    } else {
      // Try inbox_threads as fallback
      const { data: inboxThread } = await supabase
        .from("inbox_threads")
        .select("id, campaign_id, lead_id")
        .eq("id", message.thread_id)
        .maybeSingle();

      if (!inboxThread) {
        return new Response(
          JSON.stringify({ ok: false, error: "thread_not_found" }),
          { status: 404, headers: { "content-type": "application/json" } }
        );
      }

      // Use inbox_threads data
      thread = {
        id: inboxThread.id,
        account_id: null,
        lead_id: inboxThread.lead_id || message.lead_id,
        campaign_id: inboxThread.campaign_id,
      };
    }

    // Build text for classification
    const text = normalizeText(message.body_text, message.body_html);
    const fullText = `${message.subject || ""}\n\n${text}`.trim();

    if (!fullText || fullText.length < 10) {
      return new Response(
        JSON.stringify({ ok: false, error: "message_too_short" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Get insurance context
    const insuranceContext = await getInsuranceContext(thread.id);

    // Classify with OpenAI
    const result = await classifyWithOpenAI(fullText, message.subject, insuranceContext);

    // Process classification (triggers all actions)
    const { data: classificationId, error: processError } = await supabase.rpc(
      "process_reply_classification_v2",
      {
        p_message_id: message.id,
        p_thread_id: thread.id,
        p_lead_id: thread.lead_id || message.lead_id,
        p_classification: result.classification,
        p_confidence_score: result.confidence,
        p_extracted_data: result.extracted_data,
        p_insurance_context: insuranceContext,
      }
    );

    if (processError) {
      console.error("Error processing classification:", processError);
      // Still return success with classification, but log the error
    }

    return new Response(
      JSON.stringify({
        ok: true,
        classification: result.classification,
        confidence: result.confidence,
        extracted_data: result.extracted_data,
        reasoning: result.reasoning,
        classification_id: classificationId,
        triggered_actions: processError ? null : "See reply_classifications.triggered_actions",
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    console.error("Classification error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});
