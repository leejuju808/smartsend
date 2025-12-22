import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * POST /api/inbox/owner/estimate-job-value
 * AI-Powered Value Estimation
 * Analyzes message thread and suggests job type, value range, probability, and timeline
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { threadId } = body;

    if (!threadId) {
      return NextResponse.json(
        { error: "threadId is required" },
        { status: 400 }
      );
    }

    // Get thread and messages
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id, contact_id, campaign_id, homeowner_name")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Get all messages in thread
    const { data: messages, error: messagesError } = await supabase
      .from("inbox_messages")
      .select("id, body_raw, body_clean, subject, received_at, from_email")
      .eq("thread_id", threadId)
      .order("received_at", { ascending: true });

    if (messagesError) {
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    // Get contact info
    let contactInfo = "";
    if (thread.contact_id) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("first_name, last_name, email, city, state")
        .eq("id", thread.contact_id)
        .single();
      
      if (contact) {
        contactInfo = `Homeowner: ${contact.first_name || ""} ${contact.last_name || ""} (${contact.email})\n`;
        if (contact.city || contact.state) {
          contactInfo += `Location: ${contact.city || ""}, ${contact.state || ""}\n`;
        }
      }
    }

    // Build conversation history
    const conversationHistory = messages
      ?.map((msg) => {
        const from = msg.from_email === thread.homeowner_name ? "Homeowner" : "You";
        const body = msg.body_clean || msg.body_raw || "";
        const subject = msg.subject ? `Subject: ${msg.subject}\n` : "";
        return `${from}:\n${subject}${body}`;
      })
      .join("\n\n---\n\n") || "";

    // AI Analysis
    const systemPrompt = `You are an expert roofing contractor AI assistant. Analyze homeowner messages and estimate:

1. JOB TYPE (one of):
   - roof_replacement: Full roof replacement
   - roof_repair: Partial repair, patch work
   - storm_damage_claim: Insurance claim for storm damage
   - new_construction: New construction project
   - gutter_roof_package: Gutter installation + roof work
   - other: Doesn't fit above categories

2. ESTIMATED JOB VALUE RANGE:
   - Provide min and max in dollars
   - Consider: roof size, damage extent, location, insurance involvement
   - Typical ranges:
     * Small repair: $500-$2,000
     * Medium repair: $2,000-$5,000
     * Large repair/partial replacement: $5,000-$12,000
     * Full replacement (small home): $8,000-$15,000
     * Full replacement (medium home): $15,000-$25,000
     * Full replacement (large home): $25,000-$40,000+
     * Storm damage (insurance): $10,000-$30,000+

3. PROBABILITY OF CLOSING (0-100):
   - 90-100: Very strong signals (urgent need, insurance claim, ready to book)
   - 70-89: Good signals (asking for quote, interested, timeline mentioned)
   - 50-69: Moderate signals (questions, comparing, thinking about it)
   - 30-49: Weak signals (vague interest, no timeline)
   - 0-29: Very weak (just browsing, not ready)

4. EXPECTED JOB TIMELINE:
   - Estimate days/weeks until close
   - Consider urgency, insurance timeline, homeowner readiness

Return JSON:
{
  "job_type": "roof_replacement",
  "estimated_value_min": 15000,
  "estimated_value_max": 25000,
  "probability": 75,
  "expected_timeline_days": 14,
  "reasoning": "Homeowner mentions insurance claim and wants full replacement. Strong buying signals."
}`;

    const userPrompt = `${contactInfo}

CONVERSATION HISTORY:
${conversationHistory}

Analyze this conversation and provide job estimation.`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
        max_tokens: 500,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content in OpenAI response");
      }

      const result = JSON.parse(content);
      
      // Validate and normalize
      const validJobTypes = [
        "roof_replacement",
        "roof_repair",
        "storm_damage_claim",
        "new_construction",
        "gutter_roof_package",
        "other",
      ];
      
      if (!validJobTypes.includes(result.job_type)) {
        result.job_type = "other";
      }

      result.estimated_value_min = Math.max(0, Math.round(result.estimated_value_min || 0));
      result.estimated_value_max = Math.max(
        result.estimated_value_min,
        Math.round(result.estimated_value_max || result.estimated_value_min)
      );
      result.probability = Math.max(0, Math.min(100, Math.round(result.probability || 80)));
      result.expected_timeline_days = Math.max(1, Math.round(result.expected_timeline_days || 14));

      // Calculate expected close date
      const expectedCloseDate = new Date();
      expectedCloseDate.setDate(expectedCloseDate.getDate() + result.expected_timeline_days);

      return NextResponse.json({
        success: true,
        job_type: result.job_type,
        estimated_value_min: result.estimated_value_min,
        estimated_value_max: result.estimated_value_max,
        probability: result.probability,
        expected_close_date: expectedCloseDate.toISOString().split("T")[0],
        expected_timeline_days: result.expected_timeline_days,
        reasoning: result.reasoning || "AI analysis based on conversation content",
      });
    } catch (aiError: any) {
      console.error("AI estimation error:", aiError);
      // Return safe defaults
      return NextResponse.json({
        success: true,
        job_type: "other",
        estimated_value_min: 5000,
        estimated_value_max: 15000,
        probability: 70,
        expected_close_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        expected_timeline_days: 14,
        reasoning: "Default estimation (AI analysis unavailable)",
      });
    }
  } catch (error: any) {
    console.error("Error in /api/inbox/owner/estimate-job-value:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



















































