// Block 20400 — Install-Ready Playbook v1
// Automated Call Script + Follow-Up Sequence Built From Insurance Data
//
// This function generates:
// - Personalized call script for roofing contractors
// - Follow-up email/SMS sequence
// - Recommended next action
//
// This is the block that makes SmartSend money for contractors.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CallScript {
  opener: string;
  proof_of_understanding: string;
  installation_readiness_check: string;
  supplement_trigger?: string; // Only if missing items found
  close: string;
  full_script_text: string;
}

interface FollowUpMessage {
  day_offset: number;
  channel: "email" | "sms";
  subject?: string; // For email
  body: string;
  purpose: string;
}

interface FollowUpSequence {
  sequence_type: "install_ready" | "claim_pending" | "acv_only" | "big_deductible" | "supplement_needed";
  messages: FollowUpMessage[];
}

interface PlaybookResult {
  call_script: CallScript;
  followup_sequence: FollowUpSequence;
  next_action: string;
  next_action_priority: "HIGH" | "MEDIUM" | "LOW";
  metadata: {
    trigger_reason: string;
    generation_confidence: number;
    contractor_name?: string;
    homeowner_name?: string;
  };
}

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
    const { thread_id } = body;

    if (!thread_id) {
      return new Response(
        JSON.stringify({ error: "thread_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get thread with all insurance and scope data
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select(`
        id,
        campaign_id,
        contact_id,
        insurance_carrier,
        insurance_claim_status,
        insurance_deductible_amount,
        insurance_deductible_type,
        insurance_deductible_percentage,
        insurance_payout_type,
        insurance_depreciation_recoverable,
        insurance_depreciation_amount,
        insurance_install_ready,
        insurance_next_action,
        has_parsed_scope,
        claim_financials,
        roof_scope,
        profitability_signals
      `)
      .eq("id", thread_id)
      .single();

    if (threadError || !thread) {
      return new Response(
        JSON.stringify({ error: "Thread not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get contact/lead info for personalization
    let homeownerName = "there";
    let contractorName = "SmartSend";
    
    if (thread.contact_id) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("first_name, last_name")
        .eq("id", thread.contact_id)
        .single();
      
      if (contact) {
        homeownerName = contact.first_name || homeownerName;
      }
    }

    // Get campaign/contractor info
    if (thread.campaign_id) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("name, owner_id")
        .eq("id", thread.campaign_id)
        .single();
      
      if (campaign?.owner_id) {
        const { data: owner } = await supabase
          .from("users")
          .select("first_name, last_name")
          .eq("id", campaign.owner_id)
          .single();
        
        if (owner) {
          contractorName = owner.first_name || contractorName;
        }
      }
    }

    // Extract scope details
    const roofScope = thread.roof_scope || {};
    const claimFinancials = thread.claim_financials || {};
    const profitabilitySignals = thread.profitability_signals || {};
    
    const roofSquares = roofScope.total_squares || roofScope.squares || null;
    const material = roofScope.material || null;
    const stories = roofScope.stories || null;
    const steepCharge = roofScope.steep_charge || false;
    const missingItems = profitabilitySignals.missing_items || [];
    
    const rcvTotal = claimFinancials.rcv_total || null;
    const deductible = thread.insurance_deductible_amount || null;
    const payoutType = thread.insurance_payout_type || "unknown";

    // Determine sequence type
    let sequenceType: FollowUpSequence["sequence_type"] = "install_ready";
    if (thread.insurance_claim_status === "under_review" || thread.insurance_claim_status === "claim_filed_awaiting_adjuster") {
      sequenceType = "claim_pending";
    } else if (payoutType === "ACV") {
      sequenceType = "acv_only";
    } else if (deductible && deductible >= 2500) {
      sequenceType = "big_deductible";
    } else if (missingItems.length > 0) {
      sequenceType = "supplement_needed";
    }

    // Build context for AI
    const context = {
      homeowner_name: homeownerName,
      contractor_name: contractorName,
      carrier: thread.insurance_carrier || "Unknown",
      claim_status: thread.insurance_claim_status || "unknown",
      deductible: deductible,
      deductible_type: thread.insurance_deductible_type || "unknown",
      payout_type: payoutType,
      rcv_total: rcvTotal,
      roof_squares: roofSquares,
      material: material,
      stories: stories,
      steep_charge: steepCharge,
      missing_items: missingItems,
      sequence_type: sequenceType,
    };

    // Generate call script and follow-up sequence using AI
    const systemPrompt = `You are a roofing sales coach AI that generates personalized call scripts and follow-up sequences for contractors.

Generate a complete install-ready playbook with:

1. CALL SCRIPT (roofing-specific, personalized):
   - Opener: Uses homeowner's name + reference to claim
   - Proof of Understanding: Summarize THEIR claim back to them (builds trust)
   - Installation Readiness Check: Soft close asking about scheduling preference
   - Supplement Trigger: Only if missing_items array has items - mention handling supplements at no cost
   - Close: Confirm materials delivery and install dates
   - Full Script Text: Complete script as one continuous text

2. FOLLOW-UP SEQUENCE (based on sequence_type):
   - install_ready: Day 0 (Email+SMS), Day 1 (Call), Day 3 (SMS), Day 5 (Voicemail), Day 7 (Final call)
   - claim_pending: Supportive, checking in tone
   - acv_only: Education-based messages about ACV and recovering depreciation
   - big_deductible: Focus on payment options, timing flexibility, financing
   - supplement_needed: Emphasize handling supplements at no cost

3. RECOMMENDED NEXT ACTION:
   - Single clear instruction
   - Priority: HIGH, MEDIUM, or LOW

Return STRICT JSON ONLY with this structure:
{
  "call_script": {
    "opener": "...",
    "proof_of_understanding": "...",
    "installation_readiness_check": "...",
    "supplement_trigger": "..." (only if missing_items.length > 0),
    "close": "...",
    "full_script_text": "..."
  },
  "followup_sequence": {
    "sequence_type": "...",
    "messages": [
      {"day_offset": 0, "channel": "email", "subject": "...", "body": "...", "purpose": "..."},
      {"day_offset": 0, "channel": "sms", "body": "...", "purpose": "..."},
      ...
    ]
  },
  "next_action": "CALL IMMEDIATELY – homeowner is ready to schedule",
  "next_action_priority": "HIGH",
  "metadata": {
    "trigger_reason": "...",
    "generation_confidence": 0.95,
    "contractor_name": "...",
    "homeowner_name": "..."
  }
}`;

    const userPrompt = `Generate install-ready playbook for:

Homeowner: ${homeownerName}
Contractor: ${contractorName}
Carrier: ${context.carrier}
Claim Status: ${context.claim_status}
Deductible: ${deductible ? `$${deductible.toLocaleString()}` : "Unknown"}
Payout Type: ${payoutType}
RCV Total: ${rcvTotal ? `$${rcvTotal.toLocaleString()}` : "Unknown"}
Roof Squares: ${roofSquares || "Unknown"}
Material: ${material || "Unknown"}
Stories: ${stories || "Unknown"}
Steep Charge: ${steepCharge ? "Yes" : "No"}
Missing Items: ${missingItems.length > 0 ? missingItems.join(", ") : "None"}
Sequence Type: ${sequenceType}

Generate personalized call script and follow-up sequence.`;

    let playbookResult: PlaybookResult;
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
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
      
      // Validate and build result
      playbookResult = {
        call_script: {
          opener: parsed.call_script?.opener || "",
          proof_of_understanding: parsed.call_script?.proof_of_understanding || "",
          installation_readiness_check: parsed.call_script?.installation_readiness_check || "",
          supplement_trigger: parsed.call_script?.supplement_trigger || undefined,
          close: parsed.call_script?.close || "",
          full_script_text: parsed.call_script?.full_script_text || "",
        },
        followup_sequence: {
          sequence_type: parsed.followup_sequence?.sequence_type || sequenceType,
          messages: parsed.followup_sequence?.messages || [],
        },
        next_action: parsed.next_action || "Follow-up Day 3",
        next_action_priority: parsed.next_action_priority || "MEDIUM",
        metadata: {
          trigger_reason: parsed.metadata?.trigger_reason || "install_ready flag set",
          generation_confidence: parsed.metadata?.generation_confidence || 0.9,
          contractor_name: contractorName,
          homeowner_name: homeownerName,
        },
      };
    } catch (error) {
      console.error("OpenAI generation error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to generate playbook", details: String(error) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update inbox_threads with playbook results
    const updateData: any = {
      install_ready_playbook_generated: true,
      install_ready_playbook_generated_at: new Date().toISOString(),
      install_ready_call_script: playbookResult.call_script,
      install_ready_followup_sequence: playbookResult.followup_sequence,
      install_ready_next_action: playbookResult.next_action,
      install_ready_next_action_priority: playbookResult.next_action_priority,
      install_ready_playbook_metadata: playbookResult.metadata,
    };

    const { error: updateError } = await supabase
      .from("inbox_threads")
      .update(updateData)
      .eq("id", thread_id);

    if (updateError) {
      console.error("Error updating thread:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update thread", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(playbookResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Install-Ready Playbook] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
















































