// Block 21200 — SmartSend Roofing Price Objection Brain v1
// ("Price Is Too High" • "Other Roofer Cheaper" • Deductible Confusion • ACV/RCV Misunderstandings • Insurance Price Logic)
//
// This is one of the MOST IMPORTANT sales features for roofing companies.
//
// If a roofer can handle objections confidently → they close MORE jobs.
// If they freeze, hesitate, or get defensive → they LOSE the job.
//
// SmartSend Roofing Price Objection Brain v1 solves ALL of these with AI-powered,
// claim-aware, deductible-aware, proposal-aware rebuttals.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ObjectionRequest {
  thread_id: string;
  objection_type?: string;
  objection_text?: string;
  message_text?: string;
  message_subject?: string;
  tone?: "confident" | "friendly" | "professional" | "short_direct" | "detailed_educational" | "insurance_heavy" | "soft_reassurance";
  regenerate?: boolean;
}

interface ContextData {
  insurance_rcv?: number;
  insurance_acv?: number;
  deductible?: number;
  proposal_price?: number;
  underpayment_amount?: number;
  missing_items?: any[];
  underpriced_items?: any[];
  o_and_p_missing?: boolean;
  approval_status?: string;
  supplement_pending?: boolean;
  carrier_name?: string;
  homeowner_name?: string;
  emotional_tone?: string;
  buying_signals?: string[];
  urgency?: string;
}

interface ObjectionResponse {
  response_id: string;
  detected_objection_type: string;
  detection_confidence: number;
  response_short: string;
  response_medium: string;
  response_long: string;
  context_used: ContextData;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    if (!openaiKey) {
      throw new Error("Missing OpenAI API key");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const openai = new OpenAI({ apiKey: openaiKey });

    const body = await req.json() as ObjectionRequest;
    const {
      thread_id,
      objection_type,
      objection_text,
      message_text,
      message_subject,
      tone = "confident",
      regenerate = false,
    } = body;

    if (!thread_id) {
      return new Response(
        JSON.stringify({ error: "thread_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Gather context data from database function
    const { data: contextData, error: contextError } = await supabase.rpc(
      "gather_objection_context",
      { p_thread_id: thread_id }
    );

    if (contextError) {
      console.error("Error gathering context:", contextError);
    }

    const context: ContextData = contextData || {};

    // Detect objection type if not provided
    let detectedObjectionType = objection_type;
    let detectedText = objection_text || message_text || "";
    let detectionConfidence = 0.8;

    if (!detectedObjectionType && (message_text || message_subject)) {
      // Use AI to detect objection type
      const detectionPrompt = `Analyze this homeowner message and detect if there's a price objection. Return ONLY a JSON object with:
{
  "objection_type": "price_too_high" | "other_roofer_cheaper" | "still_getting_quotes" | "insurance_didnt_approve_amount" | "want_to_wait" | "cant_afford_deductible" | "why_pay_deductible" | "other" | null,
  "confidence": 0.0-1.0,
  "objection_text": "exact quote if objection detected"
}

Message: ${message_text || ""}
Subject: ${message_subject || ""}

If no objection detected, set objection_type to null.`;

      try {
        const detectionResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are an expert at detecting sales objections in roofing industry messages." },
            { role: "user", content: detectionPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        });

        const detectionResult = JSON.parse(
          detectionResponse.choices[0]?.message?.content || "{}"
        );

        if (detectionResult.objection_type) {
          detectedObjectionType = detectionResult.objection_type;
          detectionConfidence = detectionResult.confidence || 0.7;
          detectedText = detectionResult.objection_text || detectedText;
        }
      } catch (error) {
        console.error("Error detecting objection:", error);
        // Fallback to keyword detection
        const { data: keywordDetection } = await supabase.rpc("detect_price_objection", {
          p_text: detectedText,
          p_subject: message_subject || null,
          p_thread_id: thread_id,
        });

        if (keywordDetection?.primary_objection_type) {
          detectedObjectionType = keywordDetection.primary_objection_type;
          detectionConfidence = keywordDetection.confidence || 0.6;
        }
      }
    }

    if (!detectedObjectionType) {
      return new Response(
        JSON.stringify({ error: "No objection detected in message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if response already exists (unless regenerating)
    if (!regenerate) {
      const { data: existingResponse } = await supabase
        .from("price_objection_responses")
        .select("id, response_short, response_medium, response_long")
        .eq("thread_id", thread_id)
        .eq("detected_objection_type", detectedObjectionType)
        .eq("response_tone", tone)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (existingResponse && existingResponse.response_short) {
        return new Response(
          JSON.stringify({
            response_id: existingResponse.id,
            detected_objection_type: detectedObjectionType,
            detection_confidence: detectionConfidence,
            response_short: existingResponse.response_short,
            response_medium: existingResponse.response_medium,
            response_long: existingResponse.response_long,
            context_used: context,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Generate responses using AI
    const responses = await generateObjectionResponses(
      openai,
      detectedObjectionType,
      detectedText,
      context,
      tone
    );

    // Store response in database
    const { data: storedResponse, error: storeError } = await supabase.rpc(
      "store_objection_response",
      {
        p_thread_id: thread_id,
        p_objection_type: detectedObjectionType,
        p_objection_text: detectedText,
        p_context_data: context,
        p_response_short: responses.short,
        p_response_medium: responses.medium,
        p_response_long: responses.long,
        p_response_tone: tone,
        p_detection_confidence: detectionConfidence,
        p_ai_confidence_score: 0.85,
        p_detected_from: objection_type ? "manual" : "ai_detection",
      }
    );

    if (storeError) {
      console.error("Error storing response:", storeError);
    }

    // Log detection
    await supabase.from("objection_detection_log").insert({
      thread_id,
      message_text: detectedText,
      message_subject: message_subject,
      detected_objection_types: [detectedObjectionType],
      detection_confidence: detectionConfidence,
      detection_source: objection_type ? "manual" : "ai_analysis",
      response_id: storedResponse,
    });

    return new Response(
      JSON.stringify({
        response_id: storedResponse,
        detected_objection_type: detectedObjectionType,
        detection_confidence: detectionConfidence,
        response_short: responses.short,
        response_medium: responses.medium,
        response_long: responses.long,
        context_used: context,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in price-objection-brain-v1:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function generateObjectionResponses(
  openai: OpenAI,
  objectionType: string,
  objectionText: string,
  context: ContextData,
  tone: string
): Promise<{ short: string; medium: string; long: string }> {
  // Build context summary
  const contextSummary = buildContextSummary(context);

  // Build tone instructions
  const toneInstructions = getToneInstructions(tone);

  // Build objection-specific prompt
  const objectionPrompt = buildObjectionPrompt(objectionType, context);

  const systemPrompt = `You are an expert roofing sales coach helping roofers handle price objections confidently.

${toneInstructions}

CRITICAL INSURANCE CLAIM LOGIC:
- In insurance claims, the homeowner's out-of-pocket cost is ONLY their deductible
- Insurance has already approved the RCV amount
- The homeowner's cost doesn't change based on which roofer they choose
- If insurance underpaid, explain that other roofers cutting corners leave out code-required items
- Always emphasize that waiting delays receiving the depreciation check

Generate three versions of the response:
1. SHORT (SMS-style): 1-2 sentences, direct, actionable
2. MEDIUM (Email reply): 3-5 sentences, professional, educational
3. LONG (Phone script): Full conversation flow with natural transitions

${objectionPrompt}

Context:
${contextSummary}

Objection: "${objectionText}"

Return ONLY a JSON object:
{
  "short": "SMS-style response (1-2 sentences)",
  "medium": "Email reply (3-5 sentences)",
  "long": "Phone script with natural conversation flow"
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate responses for this objection: "${objectionText}"` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const content = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);

  return {
    short: parsed.short || "I understand your concern. Let me explain why this is the right choice.",
    medium: parsed.medium || "I understand your concern about the price. Let me explain why this is the right choice.",
    long: parsed.long || "I understand your concern about the price. Let me explain why this is the right choice.",
  };
}

function buildContextSummary(context: ContextData): string {
  const parts: string[] = [];

  if (context.homeowner_name) {
    parts.push(`Homeowner: ${context.homeowner_name}`);
  }

  if (context.insurance_rcv) {
    parts.push(`Insurance RCV: $${context.insurance_rcv.toLocaleString()}`);
  }

  if (context.deductible) {
    parts.push(`Deductible: $${context.deductible.toLocaleString()}`);
  }

  if (context.proposal_price) {
    parts.push(`Proposal Price: $${context.proposal_price.toLocaleString()}`);
  }

  if (context.underpayment_amount && context.underpayment_amount > 0) {
    parts.push(`Insurance Underpayment: $${context.underpayment_amount.toLocaleString()}`);
  }

  if (context.missing_items && context.missing_items.length > 0) {
    parts.push(`Missing Items: ${context.missing_items.length} items (e.g., ${context.missing_items[0]?.description || "drip edge, steep charge"})`);
  }

  if (context.o_and_p_missing) {
    parts.push("O&P (Overhead & Profit) is missing from insurance scope");
  }

  if (context.approval_status) {
    parts.push(`Approval Status: ${context.approval_status}`);
  }

  if (context.carrier_name) {
    parts.push(`Insurance Carrier: ${context.carrier_name}`);
  }

  return parts.join("\n");
}

function getToneInstructions(tone: string): string {
  const instructions: Record<string, string> = {
    confident: "Be confident and assertive. Show expertise. Use strong language.",
    friendly: "Be warm and approachable. Use conversational language. Show empathy.",
    professional: "Be formal and business-like. Use industry terminology. Maintain professionalism.",
    short_direct: "Be brief and to the point. No fluff. Direct statements.",
    detailed_educational: "Be educational and thorough. Explain insurance logic. Help homeowner understand.",
    insurance_heavy: "Focus heavily on insurance claim mechanics. Explain RCV, ACV, deductible, depreciation.",
    soft_reassurance: "Be gentle and reassuring. Acknowledge concerns. Build trust slowly.",
  };

  return instructions[tone] || instructions.confident;
}

function buildObjectionPrompt(objectionType: string, context: ContextData): string {
  const prompts: Record<string, string> = {
    price_too_high: `OBJECTION: "Price is too high"

KEY POINTS:
- Insurance has already approved this amount
- Homeowner's out-of-pocket cost is ONLY their deductible ($${context.deductible || "X"})
- Their cost doesn't change regardless of which roofer they choose
- If deductible is unknown, explain that out-of-pocket isn't the full job amount`,

    other_roofer_cheaper: `OBJECTION: "Another roofer is cheaper"

KEY POINTS:
${context.underpayment_amount && context.underpayment_amount > 0
      ? `- Insurance underpaid by $${context.underpayment_amount.toLocaleString()}
- If someone is offering to do this for less than insurance approved, they're cutting corners
- They're leaving out code-required items like drip edge, ice & water, or ridge ventilation
- We repair everything insurance approved so homeowner stays compliant and protected`
      : `- Homeowner's cost doesn't go down when another roofer is cheaper - deductible stays the same
- What matters is who does the work right the first time
- Insurance approved $${context.insurance_rcv || "X"} for full replacement`},

    still_getting_quotes: `OBJECTION: "We're still getting other quotes"

KEY POINTS:
- Totally fine to compare, but since this is an insurance claim, all approved roofers must use the same approved scope
- Homeowner's total cost won't change - deductible stays the same
- Insurance has already approved the amount`,

    insurance_didnt_approve_amount: `OBJECTION: "Insurance didn't approve that amount"

KEY POINTS:
${context.underpayment_amount && context.underpayment_amount > 0
      ? `- That's correct - insurance left out several items (like steep charge and drip edge)
- We help get those added at no cost to homeowner so the claim reflects full replacement
- Underpayment: $${context.underpayment_amount.toLocaleString()}`
      : `- It's approved for the full replacement
- Homeowner's out-of-pocket is only the deductible`},

    want_to_wait: `OBJECTION: "We want to wait"

KEY POINTS:
- Totally understand
- The depreciation check is only released after install, so waiting delays receiving the full payout
- We can get them in next week and unlock those funds immediately`,

    cant_afford_deductible: `OBJECTION: "We don't know if we can afford the deductible"

KEY POINTS:
- Deductible is the only cost homeowner is responsible for
- Everything else is covered by carrier
- We can work with them on timing for that`,

    why_pay_deductible: `OBJECTION: "Why do we have to pay a deductible at all?"

KEY POINTS:
- Deductible is standard in all insurance policies
- It's the homeowner's share of the claim
- Everything above the deductible is covered by insurance
- This is normal and expected`,

    other: `OBJECTION: Generic price concern

KEY POINTS:
- Acknowledge the concern
- Explain insurance claim mechanics
- Emphasize that deductible is the only out-of-pocket cost
- Build confidence in the proposal`,
  };

  return prompts[objectionType] || prompts.other;
}
















































