import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * POST /api/reports/ai/insights
 * Generate AI insights for a workspace
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { workspace_id, company_id } = body;

    if (!workspace_id) {
      return NextResponse.json({ error: "Missing workspace_id" }, { status: 400 });
    }

    // Verify workspace membership
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Gather data for insights
    const insights = await generateDailyInsights(supabase, workspace_id, company_id);

    return NextResponse.json({ insights });
  } catch (error: any) {
    console.error("Error generating AI insights:", error);
    return NextResponse.json(
      { error: "Failed to generate insights", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reports/ai/insights
 * Get existing AI insights
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const company_id = searchParams.get("company_id");
    const limit = parseInt(searchParams.get("limit") || "10");

    if (!workspace_id) {
      return NextResponse.json({ error: "Missing workspace_id" }, { status: 400 });
    }

    // Verify workspace membership
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build query
    let query = supabase
      .from("ai_insights")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("is_archived", false)
      .order("generated_at", { ascending: false })
      .limit(limit);

    if (company_id) {
      query = query.eq("roofing_company_id", company_id);
    }

    const { data: insights, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({ insights: insights || [] });
  } catch (error: any) {
    console.error("Error fetching AI insights:", error);
    return NextResponse.json(
      { error: "Failed to fetch insights", details: error.message },
      { status: 500 }
    );
  }
}

async function generateDailyInsights(
  supabase: any,
  workspace_id: string,
  company_id: string | null
) {
  // Get recent sales rep data
  const { data: salesData } = await supabase
    .from("report_sales_reps")
    .select("*")
    .eq("workspace_id", workspace_id)
    .eq("period", "monthly")
    .order("period_start", { ascending: false })
    .limit(2);

  // Get recent job profit data
  const { data: profitData } = await supabase
    .from("report_job_profit")
    .select("*")
    .eq("workspace_id", workspace_id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Get crew performance
  const { data: crewData } = await supabase
    .from("report_crews")
    .select("*")
    .eq("workspace_id", workspace_id)
    .eq("period", "monthly")
    .order("period_start", { ascending: false })
    .limit(10);

  // Get marketing data
  const { data: marketingData } = await supabase
    .from("report_marketing_channels")
    .select("*")
    .eq("workspace_id", workspace_id)
    .eq("period", "monthly")
    .order("period_start", { ascending: false })
    .limit(10);

  // Prepare data for AI
  const prompt = `
You are a roofing business analyst for SmartSend. Analyze the following data and provide 5-7 concise, actionable insights in bullet format.

SALES REP PERFORMANCE (Last 2 Months):
${JSON.stringify(salesData, null, 2)}

JOB PROFITABILITY (Last 50 Jobs):
${JSON.stringify(profitData?.slice(0, 10), null, 2)}

CREW PERFORMANCE (Last Month):
${JSON.stringify(crewData, null, 2)}

MARKETING CHANNELS (Last Month):
${JSON.stringify(marketingData, null, 2)}

Provide insights that:
1. Highlight trends and patterns
2. Identify top performers and underperformers
3. Flag potential issues or risks
4. Suggest actionable recommendations
5. Use specific numbers and percentages

Format as clean bullet points. Be direct and actionable.
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a concise, actionable roofing business analyst. Provide specific insights with numbers and recommendations.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 800,
    temperature: 0.3,
  });

  const insightsText = completion.choices[0]?.message?.content || "Unable to generate insights.";

  // Parse insights into structured format
  const insightLines = insightsText
    .split("\n")
    .filter((line) => line.trim().startsWith("-") || line.trim().startsWith("•") || /^\d+\./.test(line.trim()))
    .map((line) => line.replace(/^[-•\d.\s]+/, "").trim())
    .filter((line) => line.length > 0);

  // Save insights to database
  const insights = [];
  for (const line of insightLines.slice(0, 7)) {
    const { data: insight } = await supabase
      .from("ai_insights")
      .insert({
        workspace_id,
        roofing_company_id: company_id,
        insight_type: "daily_summary",
        category: "general",
        title: line.substring(0, 100),
        message: line,
        severity: line.toLowerCase().includes("risk") || line.toLowerCase().includes("warning") ? "warning" : "info",
        generated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insight) {
      insights.push(insight);
    }
  }

  return insights;
}

























