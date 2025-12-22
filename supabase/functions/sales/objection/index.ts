// Block 59000 — SmartSend Roofing "AI Sales Coach + Objection Handling System" v1
// Edge Function: AI Objection Response Engine
// Generates perfect verbal responses, text/email messages, confidence scripts, and follow-up plans

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai";
import { createClient } from "jsr:@supabase/supabase-js@2";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      objection_text,
      proposal_id,
      homeowner_id,
      lead_id,
      workspace_id,
      objection_type,
      user_id,
    } = await req.json();

    if (!objection_text || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "objection_text and workspace_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get context about the proposal/homeowner/lead if available
    let context = "";
    let homeownerName = "";
    let proposalAmount = "";

    if (proposal_id) {
      const { data: proposal } = await supabase
        .from("proposals")
        .select(`
          id,
          amount,
          status,
          leads:lead_id(
            id,
            first_name,
            last_name,
            email,
            phone
          )
        `)
        .eq("id", proposal_id)
        .single();

      if (proposal) {
        proposalAmount = `$${proposal.amount || "unknown"}`;
        if (proposal.leads) {
          homeownerName = `${proposal.leads.first_name || ""} ${proposal.leads.last_name || ""}`.trim();
          context += `Homeowner: ${homeownerName}\n`;
          context += `Proposal Amount: ${proposalAmount}\n`;
          context += `Proposal Status: ${proposal.status || "unknown"}\n`;
        }
      }
    }

    if (lead_id && !homeownerName) {
      const { data: lead } = await supabase
        .from("leads")
        .select("first_name, last_name, email, phone")
        .eq("id", lead_id)
        .single();

      if (lead) {
        homeownerName = `${lead.first_name || ""} ${lead.last_name || ""}`.trim();
        context += `Homeowner: ${homeownerName}\n`;
      }
    }

    // Build AI prompt for objection handling
    const prompt = `You are SmartSend AI — an elite roofing sales coach and objection handling expert.

Your job: Generate a complete objection response package for a roofing contractor facing this homeowner objection.

CONTEXT:
${context || "No additional context available"}
Objection Type: ${objection_type || "general"}
Homeowner Objection: "${objection_text}"

Generate a comprehensive response that includes:

1. VERBAL_SCRIPT: What the contractor should say in person or on the phone (conversational, natural, confident)
2. TEXT_MESSAGE: A short, persuasive text/SMS version (under 160 characters if possible, but can be longer if needed)
3. EMAIL_MESSAGE: A professional email version (2-3 paragraphs max)
4. CONFIDENCE_SCRIPT: A confidence-building statement that addresses the homeowner's underlying concern
5. RISK_REMOVAL_SENTENCE: A sentence that removes risk and builds trust
6. FOLLOW_UP_PLAN: A strategic follow-up plan (what to do next, when, and how)
7. PSYCHOLOGICAL_ANGLE: The psychological principle being applied (e.g., "social proof", "scarcity", "value anchoring")

RULES:
- Be empathetic and understanding, never pushy
- Address the real concern behind the objection
- Use roofing industry knowledge (warranties, quality, insurance, timing, etc.)
- Make it personal and conversational
- Focus on value, not just price
- Build trust and remove risk
- Be specific, not generic
- Use the homeowner's name if available: ${homeownerName || "[Name]"}

COMMON OBJECTION TYPES:
- "price is too high" → Focus on value, quality, long-term savings, warranty
- "I need to think about it" → Create urgency, offer to answer questions, provide social proof
- "I'm getting more estimates" → Emphasize what makes them different, quality, experience
- "Your bid is higher than others" → Explain value difference, quality, warranty, insurance coverage
- "I'm not ready yet" → Understand timing, offer to stay in touch, provide value now
- "Is this covered by insurance?" → Explain insurance process, help navigate, provide confidence

Return ONLY valid JSON in this exact format:
{
  "verbal_script": "...",
  "text_message": "...",
  "email_message": "...",
  "confidence_script": "...",
  "risk_removal_sentence": "...",
  "follow_up_plan": "...",
  "psychological_angle": "..."
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are SmartSend AI, an expert roofing sales coach. Always return valid JSON with the exact fields specified.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response", raw }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save to database
    const { data: objectionRecord, error: dbError } = await supabase
      .from("sales_objections")
      .insert({
        proposal_id: proposal_id || null,
        homeowner_id: homeowner_id || null,
        lead_id: lead_id || null,
        workspace_id,
        objection_text,
        objection_type: objection_type || null,
        ai_response: JSON.stringify(parsed),
        verbal_script: parsed.verbal_script || "",
        text_message: parsed.text_message || "",
        email_message: parsed.email_message || "",
        confidence_script: parsed.confidence_script || "",
        risk_removal_sentence: parsed.risk_removal_sentence || "",
        follow_up_plan: parsed.follow_up_plan || "",
        psychological_angle: parsed.psychological_angle || "",
        created_by: user_id || null,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      // Still return the AI response even if DB save fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        objection_id: objectionRecord?.id || null,
        ...parsed,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































