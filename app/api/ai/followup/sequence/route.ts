import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { campaign_id } = await req.json();

    if (!campaign_id) {
      return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace_id from workspace_members
    const { data: membership, error: membershipError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const workspaceId = membership.workspace_id;

    // Fetch campaign with sequence and segment info
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select(
        `
        id,
        name,
        sequence,
        segment_id,
        workspace_id
      `
      )
      .eq("id", campaign_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Get the template body from the first sequence step (initial email)
    const sequence = campaign.sequence as Array<{ subject?: string; body?: string }> | null;
    const templateBody = sequence && sequence.length > 0 
      ? (sequence[0]?.body || "") 
      : "";

    if (!templateBody) {
      return NextResponse.json(
        { error: "Campaign template body not found. Please ensure the campaign has at least one sequence step." },
        { status: 400 }
      );
    }

    // Fetch segment filters if segment_id exists
    let segmentFilters = null;
    if (campaign.segment_id) {
      const { data: segment, error: segmentError } = await supabase
        .from("segments")
        .select("filters, definition, rule")
        .eq("id", campaign.segment_id)
        .single();

      if (!segmentError && segment) {
        // Use filters, definition, or rule - whichever is available
        segmentFilters = segment.filters || segment.definition || segment.rule || null;
      }
    }

    // Build the prompt
    const prompt = `You are SmartSend's AI Follow-Up Sequence Brain.
Generate a **5-step follow-up sequence** based on:

### Campaign Template (Initial Email):
${templateBody}

### ICP/Segment Filters:
${segmentFilters ? JSON.stringify(segmentFilters, null, 2) : "No specific segment filters defined"}

### Rules:
- High deliverability
- No spammy language
- Keep personalization variables intact: {{first_name}}, {{company}}, {{your_name}}
- Each follow-up must be:
  Step 1: Light bump (1–2 lines)
  Step 2: Value drop (short)
  Step 3: Case study quick-hit
  Step 4: Direct ask
  Step 5: Break-up email (soft exit)
- Output JSON:
{
  "steps": [
    {"subject": "...", "body": "..."},
    {"subject": "...", "body": "..."},
    {"subject": "...", "body": "..."},
    {"subject": "...", "body": "..."},
    {"subject": "...", "body": "..."}
  ]
}

Return ONLY valid JSON, no markdown formatting, no backticks.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are SmartSend's AI Follow-Up Sequence Brain. Generate professional, high-converting follow-up email sequences.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.55,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      return NextResponse.json(
        { error: "Invalid JSON response from AI", details: responseText },
        { status: 500 }
      );
    }

    const { steps } = parsed;
    if (!Array.isArray(steps) || steps.length !== 5) {
      return NextResponse.json(
        { error: "AI response must contain exactly 5 steps" },
        { status: 500 }
      );
    }

    // Validate each step has subject and body
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].subject || !steps[i].body) {
        return NextResponse.json(
          { error: `Step ${i + 1} is missing subject or body` },
          { status: 500 }
        );
      }
    }

    // Save to database
    const { error: insertError } = await supabase
      .from("followup_sequences")
      .insert({
        campaign_id: campaign_id,
        user_id: user.id,
        steps: steps,
      });

    if (insertError) {
      console.error("Error inserting followup sequence:", insertError);
      return NextResponse.json(
        { error: "Failed to save sequence", details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ steps });
  } catch (error: any) {
    console.error("Error generating follow-up sequence:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate follow-up sequence" },
      { status: 500 }
    );
  }
}










