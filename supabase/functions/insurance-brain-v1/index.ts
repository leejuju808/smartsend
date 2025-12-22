// Block 20360 — SmartSend Inbox Homeowner Insurance Brain v1
// Carrier detection • Claim status reading • Deductible extraction • "Install-Ready" intelligence
//
// This function analyzes ANY email from a homeowner and instantly tells the roofer:
// - Which insurance company the homeowner has
// - Whether they are in Active Claim / Pending Claim / No Claim
// - What their deductible is
// - Whether the homeowner is install-ready
// - Whether SmartSend should trigger a call, a follow-up, or a quote

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InsuranceAnalysisResult {
  insurance_carrier: string | null;
  claim_status: string | null;
  deductible: number | null;
  payout_type: string | null;
  depreciation_recoverable: boolean | null;
  install_ready: boolean;
  next_action: string | null;
  metadata?: {
    confidence?: number;
    detected_keywords?: string[];
    reasoning?: string;
  };
}

// Carrier detection list (from spec)
const INSURANCE_CARRIERS = [
  "State Farm",
  "Allstate",
  "Farmers",
  "Liberty Mutual",
  "Progressive",
  "Travelers",
  "USAA",
  "Nationwide",
  "Geico",
];

// Claim status options (from spec)
const CLAIM_STATUSES = [
  "no_claim_filed",
  "claim_filed_awaiting_adjuster",
  "adjuster_visit_scheduled",
  "under_review",
  "approved",
  "approved_acv_only",
  "supplements_needed",
  "denied",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey || !openaiKey) {
      throw new Error("Missing configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const openai = new OpenAI({ apiKey: openaiKey });

    const body = await req.json();
    const { thread_id, message_id } = body;

    if (!thread_id && !message_id) {
      return new Response(
        JSON.stringify({ error: "thread_id or message_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get thread and messages
    let threadId: string;
    let messages: any[] = [];

    if (thread_id) {
      threadId = thread_id;
      const { data: thread, error: threadError } = await supabase
        .from("inbox_threads")
        .select("id, subject")
        .eq("id", thread_id)
        .single();

      if (threadError || !thread) {
        return new Response(
          JSON.stringify({ error: "Thread not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get all messages in thread
      const { data: threadMessages, error: messagesError } = await supabase
        .from("inbox_messages")
        .select("id, subject, body_raw, body_clean, body_html, received_at, direction")
        .eq("thread_id", thread_id)
        .order("received_at", { ascending: true });

      if (!messagesError && threadMessages) {
        messages = threadMessages;
      }
    } else if (message_id) {
      // Get message and its thread
      const { data: message, error: messageError } = await supabase
        .from("inbox_messages")
        .select("id, thread_id, subject, body_raw, body_clean, body_html, received_at, direction")
        .eq("id", message_id)
        .single();

      if (messageError || !message) {
        return new Response(
          JSON.stringify({ error: "Message not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      threadId = message.thread_id;
      messages = [message];

      // Get all messages in thread for context
      const { data: threadMessages, error: messagesError } = await supabase
        .from("inbox_messages")
        .select("id, subject, body_raw, body_clean, body_html, received_at, direction")
        .eq("thread_id", threadId)
        .order("received_at", { ascending: true });

      if (!messagesError && threadMessages) {
        messages = threadMessages;
      }
    } else {
      return new Response(
        JSON.stringify({ error: "thread_id or message_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get thread subject
    const { data: thread } = await supabase
      .from("inbox_threads")
      .select("subject")
      .eq("id", threadId)
      .single();

    const threadSubject = thread?.subject || "";

    // Combine all message content for analysis
    const inboundMessages = messages.filter((m) => m.direction === "in");
    const emailTexts = inboundMessages.map((m) => {
      const body = m.body_clean || m.body_html || m.body_raw || "";
      return `Subject: ${m.subject || threadSubject}\n\n${body}`;
    });

    // Combine email texts with attachment texts
    const allTexts = [...emailTexts, ...attachmentTexts];
    const combinedText = allTexts.join("\n\n---\n\n");

    if (!combinedText.trim()) {
      return new Response(
        JSON.stringify({ error: "No email content found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process PDF attachments (claim documents, estimates, scopes)
    let attachmentTexts: string[] = [];
    try {
      // Get attachments for messages in this thread
      const { data: attachments } = await supabase
        .from("email_attachments")
        .select("id, filename, content_type, storage_path, message_id")
        .in("message_id", messages.map((m) => m.id).filter(Boolean));

      if (attachments && attachments.length > 0) {
        // Filter for PDFs
        const pdfAttachments = attachments.filter(
          (att) => att.content_type === "application/pdf"
        );

        // TODO: Extract text from PDFs using a PDF parsing service
        // For now, we'll note that PDFs exist in the metadata
        // In production, use pdf-parse or similar library:
        // for (const pdf of pdfAttachments) {
        //   const { data: urlData } = await supabase.storage
        //     .from("email-attachments")
        //     .createSignedUrl(pdf.storage_path, 3600);
        //   if (urlData?.signedUrl) {
        //     const pdfText = await extractPDFText(urlData.signedUrl);
        //     attachmentTexts.push(`[PDF: ${pdf.filename}]\n${pdfText}`);
        //   }
        // }
        
        // For now, add placeholder text indicating PDFs were found
        if (pdfAttachments.length > 0) {
          attachmentTexts.push(
            `[Found ${pdfAttachments.length} PDF attachment(s): ${pdfAttachments.map((a) => a.filename).join(", ")}]`
          );
        }
      }
    } catch (error) {
      console.error("Error processing attachments:", error);
      // Continue without attachment text
    }

    // AI Analysis using OpenAI
    const systemPrompt = `You are an Insurance Intelligence Engine for roofing contractors.
Analyze homeowner emails to extract insurance information.

Return STRICT JSON ONLY with this exact structure:
{
  "insurance_carrier": "State Farm" | "Allstate" | "Farmers" | "Liberty Mutual" | "Progressive" | "Travelers" | "USAA" | "Nationwide" | "Geico" | "Unknown Carrier (needs confirmation)" | null,
  "claim_status": "no_claim_filed" | "claim_filed_awaiting_adjuster" | "adjuster_visit_scheduled" | "under_review" | "approved" | "approved_acv_only" | "supplements_needed" | "denied" | null,
  "deductible_amount": number | null,
  "deductible_type": "fixed" | "percentage" | "unknown" | null,
  "deductible_percentage": number | null,
  "payout_type": "RCV" | "ACV" | "unknown" | null,
  "depreciation_recoverable": boolean | null,
  "depreciation_amount": number | null,
  "install_ready": boolean,
  "next_action": "call_immediately" | "send_follow_up" | "send_quote" | "wait_for_adjuster" | "prepare_supplement" | "none" | null,
  "confidence": number (0-1),
  "detected_keywords": string[],
  "reasoning": string
}

Rules:
- Carrier: Detect from text (State Farm, Allstate, etc.). If unknown but insurance mentioned, use "Unknown Carrier (needs confirmation)"
- Claim Status: Classify based on homeowner's situation
- Deductible: Extract dollar amount or percentage. If 2% mentioned, set deductible_type="percentage", deductible_percentage=2.0
- Payout Type: Detect ACV (depreciated) vs RCV (full replacement)
- Install Ready: TRUE if ALL of these are true:
  * Claim approved (claim_status = "approved" or "approved_acv_only")
  * Deductible known (deductible_amount or deductible_percentage is not null)
  * Scope of work included OR they ask for next steps OR they confirm roof type OR storm damage acknowledged
  * They ask for scheduling OR next steps
- Next Action: 
  * "call_immediately" if install_ready = true
  * "send_follow_up" if claim filed but not approved
  * "send_quote" if no claim but interested
  * "wait_for_adjuster" if adjuster scheduled
  * "prepare_supplement" if supplements_needed
  * "none" otherwise`;

    const userPrompt = `Analyze this homeowner email for insurance information:

${combinedText}

Extract all insurance details and determine if homeowner is install-ready.`;

    let analysisResult: InsuranceAnalysisResult;
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0].message.content;
      if (!content) {
        throw new Error("No content from OpenAI");
      }

      const parsed = JSON.parse(content);

      // Validate and normalize carrier
      let carrier = parsed.insurance_carrier;
      if (carrier && !INSURANCE_CARRIERS.includes(carrier)) {
        // Check if it's the "unknown" fallback
        if (carrier.includes("Unknown Carrier")) {
          carrier = "Unknown Carrier (needs confirmation)";
        } else {
          // Try to match partial names
          const matched = INSURANCE_CARRIERS.find((c) =>
            carrier.toLowerCase().includes(c.toLowerCase())
          );
          carrier = matched || "Unknown Carrier (needs confirmation)";
        }
      }

      // Validate claim status
      let claimStatus = parsed.claim_status;
      if (claimStatus && !CLAIM_STATUSES.includes(claimStatus)) {
        claimStatus = null;
      }

      // Validate next action
      const validActions = [
        "call_immediately",
        "send_follow_up",
        "send_quote",
        "wait_for_adjuster",
        "prepare_supplement",
        "none",
      ];
      let nextAction = parsed.next_action;
      if (nextAction && !validActions.includes(nextAction)) {
        nextAction = "none";
      }

      analysisResult = {
        insurance_carrier: carrier || null,
        claim_status: claimStatus || null,
        deductible: parsed.deductible_amount || null,
        payout_type: parsed.payout_type || null,
        depreciation_recoverable: parsed.depreciation_recoverable ?? null,
        install_ready: parsed.install_ready === true,
        next_action: nextAction || null,
        metadata: {
          confidence: parsed.confidence || 0.5,
          detected_keywords: parsed.detected_keywords || [],
          reasoning: parsed.reasoning || "",
        },
      };
    } catch (error) {
      console.error("OpenAI analysis error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to analyze email", details: String(error) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update inbox_threads with analysis results
    const updateData: any = {
      insurance_carrier: analysisResult.insurance_carrier,
      insurance_claim_status: analysisResult.claim_status,
      insurance_deductible_amount: analysisResult.deductible,
      insurance_payout_type: analysisResult.payout_type,
      insurance_depreciation_recoverable: analysisResult.depreciation_recoverable,
      insurance_install_ready: analysisResult.install_ready,
      insurance_next_action: analysisResult.next_action,
      insurance_analysis_metadata: analysisResult.metadata || {},
      insurance_analyzed_at: new Date().toISOString(),
    };

    // Handle deductible type and percentage if provided
    if (analysisResult.metadata?.reasoning) {
      const reasoning = analysisResult.metadata.reasoning.toLowerCase();
      if (reasoning.includes("2%") || reasoning.includes("percentage")) {
        updateData.insurance_deductible_type = "percentage";
        // Try to extract percentage from reasoning
        const percentMatch = reasoning.match(/(\d+(?:\.\d+)?)%/);
        if (percentMatch) {
          updateData.insurance_deductible_percentage = parseFloat(percentMatch[1]);
        } else {
          updateData.insurance_deductible_percentage = 2.0; // Default assumption
        }
      } else if (analysisResult.deductible) {
        updateData.insurance_deductible_type = "fixed";
      }
    }

    // Handle depreciation amount if recoverable
    if (analysisResult.depreciation_recoverable && analysisResult.metadata?.reasoning) {
      const reasoning = analysisResult.metadata.reasoning;
      const depMatch = reasoning.match(/\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
      if (depMatch) {
        updateData.insurance_depreciation_amount = parseFloat(
          depMatch[1].replace(/,/g, "")
        );
      }
    }

    const { error: updateError } = await supabase
      .from("inbox_threads")
      .update(updateData)
      .eq("id", threadId);

    if (updateError) {
      console.error("Error updating thread:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update thread", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return the 7-tag output format (from spec)
    const result = {
      insurance_carrier: analysisResult.insurance_carrier,
      claim_status: analysisResult.claim_status,
      deductible: analysisResult.deductible,
      payout_type: analysisResult.payout_type,
      depreciation_recoverable: analysisResult.depreciation_recoverable,
      install_ready: analysisResult.install_ready,
      next_action: analysisResult.next_action,
      metadata: analysisResult.metadata,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Insurance Brain] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

