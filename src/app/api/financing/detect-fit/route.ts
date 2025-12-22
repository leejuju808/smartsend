// Block 36555 — SmartSend Roofing "Smart Financing Engine + Instant Pre-Qual" v1
// API Route: AI detects if financing should be offered to a lead

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const {
      lead_id,
      proposal_id,
      proposal_price,
    } = await req.json();

    if (!lead_id && !proposal_id) {
      return NextResponse.json(
        { error: "lead_id or proposal_id is required" },
        { status: 400 }
      );
    }

    // Get lead data
    let leadData: any = {};
    let proposalData: any = {};
    let finalLeadId = lead_id;

    if (proposal_id) {
      const { data: proposal } = await supabase
        .from("proposals")
        .select(`
          id,
          proposal_data,
          lead_id,
          leads:lead_id (
            id,
            name,
            email,
            phone,
            meta
          )
        `)
        .eq("id", proposal_id)
        .single();

      if (proposal) {
        proposalData = proposal.proposal_data || {};
        if (proposal.leads) {
          leadData = proposal.leads;
          finalLeadId = proposal.lead_id;
        }
      }
    } else if (lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("*")
        .eq("id", lead_id)
        .single();

      if (lead) {
        leadData = lead;
      }
    }

    // Get message history for this lead
    const { data: messages } = await supabase
      .from("email_replies")
      .select("body, subject, created_at")
      .eq("lead_id", finalLeadId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Build context for AI
    const messageHistory = messages?.map(m => ({
      subject: m.subject,
      body: m.body?.substring(0, 500),
      date: m.created_at,
    })) || [];

    const projectPrice = proposal_price || proposalData.project_price || 0;

    // AI prompt to detect financing fit
    const prompt = `You are SmartSend AI, analyzing a roofing lead to determine if financing should be offered.

LEAD INFORMATION:
- Name: ${leadData.name || "Unknown"}
- Email: ${leadData.email || "Unknown"}
- Project Price: $${projectPrice.toLocaleString()}

MESSAGE HISTORY:
${JSON.stringify(messageHistory, null, 2)}

ANALYSIS FACTORS:
1. Home value (if available in metadata)
2. Roof size (if available)
3. Lead score/heat
4. Budget statements in messages
5. Message intent (price concerns, affordability mentions)
6. Storm claim vs retail (insurance claims typically don't need financing)
7. Price sensitivity indicators

DETECT THESE SIGNALS:
- "Can't afford it" / "Too expensive" / "That's a lot"
- "Do you offer financing?" / "Payment plans?"
- "We need to think about it" (price-related hesitation)
- Budget constraints mentioned
- Large project price ($15k+) with no insurance claim
- Homeowner expressing financial concerns

RETURN JSON:
{
  "should_offer_financing": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  "recommendation": "offer_upfront" | "optional" | "required" | "not_needed",
  "indicators": ["list", "of", "key", "indicators"]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a roofing business intelligence AI. Analyze leads and return only valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const analysis = JSON.parse(completion.choices[0].message.content || "{}");

    return NextResponse.json({
      ...analysis,
      lead_id: finalLeadId,
      proposal_id: proposal_id || null,
      project_price: projectPrice,
    });
  } catch (error: any) {
    console.error("Error detecting financing fit:", error);
    return NextResponse.json(
      { 
        error: error.message || "Internal server error",
        should_offer_financing: true, // Default to offering if error
        confidence: 0.5,
        recommendation: "optional",
      },
      { status: 500 }
    );
  }
}
































