import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY! 
});

export async function GET(req: NextRequest) {
  try {
    // Get org_id from query params
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('org_id');
    
    if (!orgId) {
      return NextResponse.json(
        { error: "org_id parameter is required" },
        { status: 400 }
      );
    }

    // Get revenue data for the organization
    const { data: revenueData, error } = await supabase
      .from("org_revenue")
      .select("*")
      .eq("org_id", orgId)
      .order("last_sync", { ascending: false })
      .limit(1)
      .single();

    if (error || !revenueData) {
      return NextResponse.json(
        { error: "No revenue data found for this organization" },
        { status: 404 }
      );
    }

    // Prepare data for AI analysis
    const { mrr, arr, churn_rate, last_sync } = revenueData;
    
    const prompt = `
    Analyze this SaaS organization's revenue data and provide insights on growth potential and churn risk.
    
    Current Metrics:
    - MRR (Monthly Recurring Revenue): $${mrr}
    - ARR (Annual Recurring Revenue): $${arr}
    - Churn Rate: ${churn_rate}%
    - Last Updated: ${new Date(last_sync).toLocaleDateString()}
    
    Please provide:
    1. 3 key insights about the current revenue situation
    2. 1 actionable recommendation to improve retention or growth
    3. A brief churn risk assessment (Low/Medium/High)
    
    Format your response as a clear, actionable analysis suitable for business stakeholders.
    `;

    // Get AI insights
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert SaaS revenue analyst with deep knowledge of subscription business metrics, customer retention strategies, and growth optimization. Provide clear, actionable insights based on revenue data."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 300,
      temperature: 0.3
    });

    const insights = completion.choices[0]?.message?.content || "Unable to generate insights at this time.";

    return NextResponse.json({
      insights,
      metrics: {
        mrr,
        arr,
        churn_rate,
        last_sync
      }
    });

  } catch (error) {
    console.error("Revenue insights error:", error);
    return NextResponse.json(
      { error: "Failed to generate revenue insights" },
      { status: 500 }
    );
  }
} 