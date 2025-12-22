// Block 239000 — SmartSend Roofing Marketing Hub v1
// POST /api/marketing/ai-builder - AI Campaign Builder
// User types: "Create a gutter upsell campaign with 3 messages"
// AI outputs: Complete campaign with SMS/Email steps, timing, personalization

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspace_id,
      prompt,
      campaign_type,
    } = body;

    if (!workspace_id || !prompt) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, prompt" },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Check for OpenAI API key
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    // Build system prompt for AI campaign builder
    const systemPrompt = `You are SmartSend's AI Marketing Campaign Builder for roofing companies.

Your job is to create complete marketing campaigns based on user requests.

When a user asks for a campaign, generate:
1. Campaign name
2. Campaign type (review, referral, upsell, reactivation, nurture, warranty, anniversary, storm_followup)
3. Trigger type (job_completed, lead_status_changed, time_delay, manual, lead_inactive, warranty_expiring, anniversary, weather_event)
4. Trigger configuration (JSON object)
5. Multiple steps with:
   - step_order (1, 2, 3...)
   - delay_hours (hours after previous step or trigger)
   - channel (email or sms)
   - subject (for email)
   - content (message content with personalization tokens like {{FIRST_NAME}}, {{JOB_TYPE}}, etc.)
   - Suggested timing (best time of day to send)

Personalization tokens available:
- {{FIRST_NAME}} - Customer's first name
- {{LAST_NAME}} - Customer's last name
- {{EMAIL}} - Customer's email
- {{JOB_TYPE}} - Type of roofing job
- {{JOB_VALUE}} - Job value/price
- {{PHONE_NUMBER}} - Company phone number
- {{COMPANY_NAME}} - Roofing company name
- {{REVIEW_LINK}} - Google review link
- {{YELP_LINK}} - Yelp review link
- {{REFERRAL_LINK}} - Referral tracking link

Return ONLY valid JSON matching this schema:
{
  "campaign": {
    "name": "string",
    "type": "review|referral|upsell|reactivation|nurture|warranty|anniversary|storm_followup",
    "trigger_type": "job_completed|lead_status_changed|time_delay|manual|lead_inactive|warranty_expiring|anniversary|weather_event",
    "trigger_config": {},
    "description": "string (brief description of campaign goal)"
  },
  "steps": [
    {
      "step_order": 1,
      "delay_hours": 0,
      "channel": "sms|email",
      "subject": "string (for email only)",
      "content": "string (message content with tokens)",
      "suggested_timing": "string (e.g., '9am-11am EST')",
      "notes": "string (why this step, what it achieves)"
    }
  ],
  "suggestions": {
    "subject_lines": ["string"],
    "call_to_actions": ["string"],
    "personalization_tips": ["string"],
    "best_time_of_day": "string",
    "customer_persona_notes": "string"
  }
}`;

    // Call OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: `Create a marketing campaign for a roofing company based on this request:\n\n"${prompt}"\n\n${campaign_type ? `Campaign type: ${campaign_type}` : ''}\n\nGenerate a complete campaign with all steps, timing, and suggestions.` 
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("[Marketing Hub AI] OpenAI error:", errorText);
      return NextResponse.json(
        { error: "Failed to generate campaign" },
        { status: 500 }
      );
    }

    const openaiData = await openaiResponse.json();
    const aiResponse = openaiData.choices?.[0]?.message?.content || "";

    let campaignData;
    try {
      campaignData = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error("[Marketing Hub AI] JSON parse error:", parseError);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    // Validate and structure the response
    if (!campaignData.campaign || !campaignData.steps) {
      return NextResponse.json(
        { error: "Invalid AI response format" },
        { status: 500 }
      );
    }

    // Return the generated campaign (user can then create it via /api/marketing/create)
    return NextResponse.json({
      success: true,
      campaign: {
        name: campaignData.campaign.name,
        type: campaignData.campaign.type,
        trigger_type: campaignData.campaign.trigger_type,
        trigger_config: campaignData.campaign.trigger_config || {},
        description: campaignData.campaign.description,
      },
      steps: campaignData.steps.map((step: any) => ({
        step_order: step.step_order,
        delay_hours: step.delay_hours,
        channel: step.channel,
        subject: step.subject || null,
        content: step.content,
        suggested_timing: step.suggested_timing,
        notes: step.notes,
      })),
      suggestions: campaignData.suggestions || {
        subject_lines: [],
        call_to_actions: [],
        personalization_tips: [],
        best_time_of_day: "",
        customer_persona_notes: "",
      },
      raw_ai_response: aiResponse, // Include for debugging
    });
  } catch (error: any) {
    console.error("[Marketing Hub AI] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























