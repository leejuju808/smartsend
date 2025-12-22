import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // Get data from last 7 days
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    // Get email events for the user
    const { data: emailEvents } = await sb
      .from("email_events")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", since);

    if (!emailEvents || emailEvents.length === 0) {
      return NextResponse.json({ 
        insights: "No email activity in the last 7 days. Start sending campaigns to get insights!" 
      });
    }

    // Aggregate quick stats
    const counts: any = { 
      sent: 0, 
      delivered: 0, 
      opened: 0, 
      clicked: 0, 
      replied: 0,
      bounced: 0,
      unsubscribed: 0
    };
    
    for (const e of emailEvents) { 
      if (counts[e.event_type] !== undefined) counts[e.event_type]++; 
    }

    // Get previous week data for comparison
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: prevWeekEvents } = await sb
      .from("email_events")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", twoWeeksAgo)
      .lt("created_at", oneWeekAgo);

    const prevWeekCounts: any = { 
      sent: 0, 
      delivered: 0, 
      opened: 0, 
      clicked: 0, 
      replied: 0,
      bounced: 0,
      unsubscribed: 0
    };
    
    if (prevWeekEvents) {
      for (const e of prevWeekEvents) { 
        if (prevWeekCounts[e.event_type] !== undefined) prevWeekCounts[e.event_type]++; 
      }
    }

    // Calculate week-over-week changes
    const changes: any = {};
    for (const key in counts) {
      if (prevWeekCounts[key] > 0) {
        changes[key] = ((counts[key] - prevWeekCounts[key]) / prevWeekCounts[key] * 100).toFixed(1);
      }
    }

    // Get campaign performance data
    const { data: campaigns } = await sb
      .from("campaigns")
      .select("id, title")
      .eq("user_id", userId);

    const campaignPerformance: any = {};
    if (campaigns) {
      for (const campaign of campaigns) {
        const campaignEvents = emailEvents.filter(e => e.campaign_id === campaign.id);
        const campaignCounts = { sent: 0, opened: 0, clicked: 0, replied: 0 };
        
        for (const e of campaignEvents) {
          if (campaignCounts[e.event_type as keyof typeof campaignCounts] !== undefined) {
            campaignCounts[e.event_type as keyof typeof campaignCounts]++;
          }
        }
        
        campaignPerformance[campaign.title || campaign.id] = campaignCounts;
      }
    }

    const prompt = `
You are a sales analytics assistant for SmartSend, an email outreach platform. 

Analyze the last 7 days of email performance data and provide actionable insights.

CURRENT WEEK DATA:
${JSON.stringify(counts, null, 2)}

PREVIOUS WEEK DATA:
${JSON.stringify(prevWeekCounts, null, 2)}

WEEK-OVER-WEEK CHANGES (%):
${JSON.stringify(changes, null, 2)}

CAMPAIGN PERFORMANCE:
${JSON.stringify(campaignPerformance, null, 2)}

Create 3-5 concise bullet-point insights that include:
1. Performance trends (mention % changes week-over-week when relevant)
2. Campaign comparisons if multiple campaigns exist
3. One specific action item to improve conversions

Format as clean bullet points. Be specific and actionable. Focus on what the user should do next.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a concise, actionable sales analytics assistant. Provide specific insights and recommendations." },
        { role: "user", content: prompt }
      ],
      max_tokens: 300,
      temperature: 0.3
    });

    const insights = completion.choices[0]?.message?.content || "Unable to generate insights at this time.";
    
    return NextResponse.json({ 
      insights,
      stats: {
        current: counts,
        previous: prevWeekCounts,
        changes
      }
    });

  } catch (error) {
    console.error("Error generating insights:", error);
    return NextResponse.json({ 
      error: "Failed to generate insights",
      insights: "Unable to generate insights due to a technical issue. Please try again later."
    }, { status: 500 });
  }
} 