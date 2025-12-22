// Block 21170 — SmartSend Roofing AI Phone Script Engine v1
// POST /api/contacts/[id]/phone-script
// Generates AI-powered phone scripts for roofing companies

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/src/lib/workspace";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SCRIPT_CATEGORIES = {
  // Category A — Homeowner Close Calls
  homeowner_ready_to_schedule: "Install-Ready Close Call",
  homeowner_viewed_proposal: "Proposal Viewed Follow-Up",
  homeowner_claim_approved: "Claim Approved Celebration",
  homeowner_deductible_needed: "Deductible Collection",
  homeowner_booking_install: "Install Date Booking",
  
  // Category B — Insurance / Adjuster Calls
  adjuster_photo_request: "Adjuster Photo Request Response",
  adjuster_supplement_followup: "Supplement Follow-Up",
  adjuster_approval_mismatch: "Approval Amount Dispute",
  adjuster_missing_line_items: "Missing Line Items Dispute",
  adjuster_op_justification: "O&P Justification",
  
  // Category C — Objection Handling Calls
  objection_lower_price: "Lower Price Objection",
  objection_thinking_about_it: "Thinking About It Objection",
  objection_not_ready: "Not Ready Yet Objection",
  objection_waiting_insurance: "Waiting on Insurance Objection",
  objection_too_expensive: "Too Expensive Objection",
  
  // Category D — Deductible Explanation Calls
  deductible_explanation_what_is: "What is a Deductible",
  deductible_explanation_why_pay: "Why Deductible Must Be Paid",
  deductible_explanation_waiving_illegal: "Why Waiving is Illegal",
  deductible_explanation_acv_rcv: "ACV vs RCV Explanation",
  deductible_explanation_payment_timeline: "Payment Timeline Explanation",
  
  // Category E — Pre-Install Calls
  pre_install_confirm_date: "Confirm Install Date",
  pre_install_remind_homeowner: "Pre-Install Reminder",
  pre_install_discuss_materials: "Materials Discussion",
  pre_install_crew_arrival: "Crew Arrival Time",
  pre_install_access_confirmation: "Access Confirmation",
  
  // Category F — Post-Install Calls
  post_install_collect_payment: "Payment Collection",
  post_install_send_warranty: "Warranty Information",
  post_install_ask_review: "Review Request",
  post_install_request_referrals: "Referral Request",
} as const;

const TONE_GUIDANCE = {
  confident: "Confident, direct, and assertive. No hesitation. Clear calls to action.",
  friendly: "Warm, personable, and conversational. Build rapport naturally.",
  professional: "Polished, business-like, and respectful. Maintains authority.",
  high_energy: "Enthusiastic, upbeat, and motivating. High energy throughout.",
  insurance_based: "Focuses on insurance logic, ACV/RCV, deductibles. Educational tone.",
  closer: "Direct, no-nonsense, focused on closing. Strong call-to-action.",
  softer: "Gentle, understanding, patient. Less pushy, more consultative.",
  short: "Ultra-concise. Get to the point quickly. Under 60 seconds total.",
  long: "Detailed, comprehensive. Takes time to explain everything thoroughly.",
} as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id: contactId } = await params;
    const body = await req.json();
    
    const {
      script_category,
      tone = "confident",
      regenerate = false,
    } = body;
    
    if (!script_category) {
      return NextResponse.json(
        { error: "script_category is required" },
        { status: 400 }
      );
    }
    
    // Get workspace
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }
    
    // Get personalization data
    const { data: personalizationData, error: personalizationError } = await supabase
      .rpc('get_phone_script_personalization_data', {
        p_contact_id: contactId,
        p_thread_id: null,
      });
    
    if (personalizationError || !personalizationData) {
      return NextResponse.json(
        { error: "Failed to load contact data", details: personalizationError?.message },
        { status: 500 }
      );
    }
    
    // Check if script already exists (unless regenerating)
    if (!regenerate) {
      const { data: existingScript } = await supabase
        .from("phone_scripts")
        .select("*")
        .eq("contact_id", contactId)
        .eq("script_category", script_category)
        .eq("workspace_id", workspaceId)
        .eq("status", "generated")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (existingScript) {
        return NextResponse.json({
          script: existingScript,
          cached: true,
        });
      }
    }
    
    // Generate script with AI
    const script = await generatePhoneScript({
      script_category,
      tone,
      personalizationData,
    });
    
    // Save to database
    const { data: savedScript, error: saveError } = await supabase
      .from("phone_scripts")
      .insert({
        contact_id: contactId,
        thread_id: personalizationData.thread_id || null,
        workspace_id: workspaceId,
        campaign_id: personalizationData.campaign_id || null,
        script_category,
        script_data: script.script_data,
        tone,
        generation_metadata: {
          personalization_inputs: personalizationData,
          trigger_reason: "manual_generation",
          ai_model: "gpt-4o-mini",
          generation_time_ms: script.generation_time_ms,
        },
        status: "generated",
      })
      .select()
      .single();
    
    if (saveError || !savedScript) {
      return NextResponse.json(
        { error: "Failed to save script", details: saveError?.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      script: savedScript,
      cached: false,
    });
  } catch (error) {
    console.error("[Phone Script Engine] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate phone script", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id: contactId } = await params;
    
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }
    
    // Get latest script for this contact
    const { data: scripts, error } = await supabase
      .from("phone_scripts")
      .select("*")
      .eq("contact_id", contactId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(10);
    
    if (error) {
      return NextResponse.json(
        { error: "Failed to load scripts", details: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ scripts: scripts || [] });
  } catch (error) {
    console.error("[Phone Script Engine] Error:", error);
    return NextResponse.json(
      { error: "Failed to load phone scripts", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

async function generatePhoneScript({
  script_category,
  tone,
  personalizationData,
}: {
  script_category: string;
  tone: string;
  personalizationData: any;
}) {
  const startTime = Date.now();
  
  const categoryName = SCRIPT_CATEGORIES[script_category as keyof typeof SCRIPT_CATEGORIES] || script_category;
  const toneGuidance = TONE_GUIDANCE[tone as keyof typeof TONE_GUIDANCE] || TONE_GUIDANCE.confident;
  
  // Build context summary
  const contextSummary = buildContextSummary(personalizationData);
  
  // Build prompt
  const systemPrompt = `You are SmartSend's AI Phone Script Engine for roofing companies.

Your job: Generate PERFECT phone scripts that help roofers:
- Close deals confidently
- Explain insurance and deductibles clearly
- Handle objections professionally
- Communicate with adjusters effectively
- Sound professional and prepared

CRITICAL RULES:
1. Every script follows this EXACT structure:
   - Opening: Confident intro, quick purpose, no rambling (1-2 sentences)
   - Context Summary: AI summarizes claim + proposal context in 1 short sentence
   - Value Anchor: Why calling, why now, what's in it for homeowner
   - Main Statement/Ask: Clear, direct, confident
   - Objection Handling: 2-3 anticipated objections with rebuttals
   - Insurance/Deductible Logic: If needed, explains clearly and simply
   - Close Sentence: Always ends with a call-to-action

2. Tone: ${toneGuidance}

3. Keep it CONVERSATIONAL - this is a phone call, not an email
4. Use the homeowner's first name naturally
5. Be specific with numbers, dates, and amounts
6. Address objections BEFORE they come up
7. Always end with a clear next step

Return ONLY valid JSON matching this exact structure:
{
  "opening": "...",
  "context_summary": "...",
  "value_anchor": "...",
  "main_statement": "...",
  "main_ask": "...",
  "objection_handling": [
    {
      "objection": "...",
      "rebuttal": "..."
    }
  ],
  "insurance_deductible_logic": "...",
  "close_sentence": "...",
  "full_script": "..." (complete formatted script combining all parts)
}`;

  const userPrompt = `Generate a ${categoryName} phone script.

CONTEXT:
${contextSummary}

HOMEOWNER INFO:
- Name: ${personalizationData.homeowner_name || "Homeowner"}
- Address: ${personalizationData.property_address || "N/A"}
- Phone: ${personalizationData.phone || "N/A"}

INSURANCE INFO:
- Carrier: ${personalizationData.insurance_carrier || "Not specified"}
- Claim Status: ${personalizationData.claim_status || "Unknown"}
- Claim Number: ${personalizationData.claim_number || "N/A"}
- Deductible: $${personalizationData.deductible || 0}
- RCV: $${personalizationData.rcv || 0}
- ACV: $${personalizationData.acv || 0}
- Adjuster: ${personalizationData.adjuster_name || "Not assigned"}

PROPOSAL STATUS:
- Viewed: ${personalizationData.proposal_viewed ? "Yes" : "No"}
- Status: ${personalizationData.proposal_status || "Not sent"}

INSTALL-READY SCORE: ${personalizationData.install_ready_score || 0}/100
Status: ${personalizationData.install_ready_status || "Unknown"}

RECENT OBJECTIONS/CLASSIFICATIONS:
${personalizationData.reply_classifications?.map((c: any) => `- ${c.classification}`).join("\n") || "None detected"}

Generate the script now.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });
  
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }
  
  let scriptData;
  try {
    scriptData = JSON.parse(content);
  } catch (e) {
    throw new Error("Failed to parse AI response");
  }
  
  const generationTime = Date.now() - startTime;
  
  return {
    script_data: scriptData,
    generation_time_ms: generationTime,
  };
}

function buildContextSummary(personalizationData: any): string {
  const parts: string[] = [];
  
  if (personalizationData.claim_status === "approved" && personalizationData.rcv) {
    parts.push(`Insurance approved $${personalizationData.rcv.toLocaleString()} for the roof`);
  }
  
  if (personalizationData.proposal_viewed) {
    parts.push("Homeowner viewed the proposal");
  }
  
  if (personalizationData.install_ready_score >= 70) {
    parts.push("Install-ready score is high (ready to schedule)");
  }
  
  if (personalizationData.deductible > 0) {
    parts.push(`Deductible is $${personalizationData.deductible.toLocaleString()}`);
  }
  
  if (parts.length === 0) {
    return "Standard follow-up call";
  }
  
  return parts.join(". ") + ".";
}
















































