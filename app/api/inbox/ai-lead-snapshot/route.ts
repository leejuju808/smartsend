// Block 20350 — AI Homeowner Intelligence Snapshot v2

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openai } from "@/lib/openai";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { conversation_id } = body;

    if (!conversation_id) {
      return NextResponse.json(
        { error: "conversation_id required" },
        { status: 400 }
      );
    }

    // 1) Load full profile row from inbox_conversation_profile_view
    const { data: convo, error } = await supabase
      .from("inbox_conversation_profile_view")
      .select("*")
      .eq("id", conversation_id)
      .single();

    if (error || !convo) {
      console.error("Lead snapshot convo error", error);
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // 2) Build structured payload for AI
    const payload = {
      homeowner: {
        name: convo.homeowner_name,
        email: convo.homeowner_email,
        phone: convo.homeowner_phone,
      },
      property: {
        address: convo.property_address,
        city: null, // Not available in current schema
        state: null, // Not available in current schema
        zip: null, // Not available in current schema
        sqft: convo.property_sqft,
        bedrooms: convo.property_bedrooms,
        bathrooms: convo.property_bathrooms,
        year_built: convo.property_year_built,
        estimated_value: convo.property_estimated_value,
      },
      roof: {
        material: convo.roof_material,
        last_replacement_year: convo.roof_last_replacement_year,
        age_estimated: convo.roof_age_estimated,
      },
      insurance: {
        is_claim: convo.is_insurance_claim || convo.has_insurance_claim,
        carrier: convo.insurance_carrier,
        status: convo.insurance_status,
        deductible: convo.insurance_deductible,
      },
      sales: {
        lead_stage: convo.lead_stage,
        lead_source: convo.lead_source || convo.created_channel,
        estimated_job_value: convo.estimated_job_value,
        actual_job_value: convo.actual_job_value,
        lost_reason_category: convo.lost_reason_category,
        lost_reason_detail: convo.lost_reason_detail,
      },
      engagement: {
        level: convo.engagement_level,
        score: convo.engagement_score,
        email_open_count: convo.email_open_count,
        email_click_count: convo.email_click_count,
        reply_count: convo.reply_count,
        call_count: convo.call_count,
        last_contact_at: convo.last_contact_at,
      },
      tags: convo.tags || [],
      meta: {
        created_at: convo.created_at,
        appointment_at: convo.appointment_at,
        appointment_status: convo.appointment_status,
      },
    };

    const systemPrompt = `
You are an AI assistant for a roofing company using SmartSend, a lead + job pipeline system.

Your job:
- Read a homeowner's profile and behavior.
- Give a short, roofing-specific summary.
- Score the opportunity.
- List main risk factors.
- Suggest a simple talk track for the next conversation.

The user is a roofing owner or coordinator. They want:
- Clear, no-BS language.
- Roofing context (replace, repair, hail, insurance).
- Fast guidance on what this job could be worth and what to say next.

Respond ONLY in JSON using this exact shape:

{
  "headline": string,   // 1 short sentence about the opportunity in roofing terms
  "summary": string,    // 2–4 sentences, plain language
  "opportunity_score": number,  // 0–100, higher = better opportunity
  "job_type": string,   // e.g. "Full replacement", "Repair", "Likely full replacement", "Inspection only", "Insurance-driven replacement"
  "risk_flags": string[], // bullets like "No reply after estimate", "Price-sensitive", "Insurance status unclear"
  "key_factors": string[], // bullets for why the score is what it is (roof age, size, claim status, engagement)
  "suggested_talk_track": string // 2–3 sentence script the roofer could roughly say on phone/email
}
`;

    const userPrompt = `
Here is the homeowner profile, property, roof info, tags, engagement, and sales status (JSON):

${JSON.stringify(payload, null, 2)}

Use this data to write the JSON response.
- Higher opportunity_score if: bigger roof, older roof, insurance claim approved/in motion, good engagement, higher home value.
- Lower opportunity_score if: cold engagement, lost on price, no contact for many days, small/simple repair only.
- If data is missing, make reasonable but conservative assumptions and mention it as a risk flag.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt.trim() },
        { role: "user", content: userPrompt.trim() },
      ],
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("Lead snapshot JSON parse error", err, raw);
      parsed = {};
    }

    const snapshot = {
      headline: parsed.headline || "Roofing opportunity summary",
      summary: parsed.summary || "",
      opportunity_score:
        typeof parsed.opportunity_score === "number"
          ? parsed.opportunity_score
          : null,
      job_type: parsed.job_type || null,
      risk_flags: Array.isArray(parsed.risk_flags) ? parsed.risk_flags : [],
      key_factors: Array.isArray(parsed.key_factors) ? parsed.key_factors : [],
      suggested_talk_track: parsed.suggested_talk_track || "",
    };

    return NextResponse.json({ snapshot });
  } catch (err) {
    console.error("Lead snapshot AI error", err);
    return NextResponse.json(
      { error: "Failed to generate snapshot" },
      { status: 500 }
    );
  }
}

