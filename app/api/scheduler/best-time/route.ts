import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { leadId } = await req.json();

    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    // Fetch lead with company data
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select(`
        *,
        companies:company_id (
          industry,
          size,
          intent_score,
          engagement_score
        )
      `)
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Fetch email events for this lead
    const { data: events } = await supabase
      .from("email_events")
      .select("event_type, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(50);

    // Fetch past campaign success for this lead
    const { data: campaignStats } = await supabase
      .from("email_logs")
      .select("opened, clicked, sent_at")
      .eq("to_email", lead.email)
      .order("sent_at", { ascending: false })
      .limit(20);

    const company = Array.isArray(lead.companies) ? lead.companies[0] : lead.companies;
    
    const prompt = `
Analyze this lead and predict the best hour of day (0-23) to send them an email:

Lead Information:
- Industry: ${company?.industry || "Unknown"}
- Company size: ${company?.size || "Unknown"}
- Timezone: ${lead.timezone || "America/Los_Angeles"}
- Intent score: ${company?.intent_score || 0}
- Engagement score: ${company?.engagement_score || 0}
- Past email events: ${JSON.stringify(events?.slice(0, 10) || [])}
- Campaign stats: ${JSON.stringify(campaignStats?.slice(0, 10) || [])}

Consider:
1. Industry norms (e.g., tech workers often check email early morning or late afternoon)
2. Company size (enterprises may have different patterns than startups)
3. Past engagement patterns (if available)
4. Timezone-adjusted optimal hours (avoid early morning or late night)
5. Typical B2B email engagement patterns

Return ONLY a JSON object with this exact structure:
{"best_hour": 13}

Where best_hour is an integer 0-23 representing the hour in the lead's local timezone.
`;

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an expert at predicting optimal email send times. Return JSON only. No prose." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });

    const content = res.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    // Parse JSON response
    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      // Try to extract JSON if wrapped in markdown
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse AI response");
      }
    }

    // Validate best_hour is between 0-23
    if (typeof result.best_hour !== "number" || result.best_hour < 0 || result.best_hour > 23) {
      result.best_hour = 13; // Default to 1 PM
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in best-time prediction:", error);
    return NextResponse.json(
      { error: error.message || "Failed to predict best send time" },
      { status: 500 }
    );
  }
}












