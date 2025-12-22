// Block 254300 — SmartSend Sales Acceleration Engine v1
// Lead Scoring Engine API
// POST /api/sales/lead-scoring

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

interface LeadScoringRequest {
  lead_id: string;
  org_id: string;
  engagement_data?: {
    emails_opened?: number;
    links_clicked?: number;
    replies_count?: number;
    last_activity?: string;
  };
  urgency_signals?: {
    keywords?: string[];
    timeline_mentioned?: boolean;
    insurance_claim?: boolean;
  };
  home_value?: number;
  call_responsiveness?: "high" | "medium" | "low" | "none";
  previous_contractor_work?: boolean;
  budget_signals?: {
    mentioned_budget?: boolean;
    financing_interest?: boolean;
    price_sensitive?: boolean;
  };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: LeadScoringRequest = await req.json();
    const { lead_id, org_id, engagement_data, urgency_signals, home_value, call_responsiveness, previous_contractor_work, budget_signals } = body;

    // Get lead data
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Get conversation history for AI analysis
    const { data: replies } = await supabase
      .from("email_replies")
      .select("body_text, created_at")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const conversationHistory = replies?.map((r) => r.body_text).join("\n\n") || "";

    // Calculate base score components
    let engagementScore = 0;
    let urgencyScore = 0;
    let valueScore = 0;
    let responsivenessScore = 0;
    let budgetScore = 0;

    // Engagement scoring (0-25 points)
    if (engagement_data) {
      if (engagement_data.emails_opened) engagementScore += Math.min(engagement_data.emails_opened * 3, 10);
      if (engagement_data.links_clicked) engagementScore += Math.min(engagement_data.links_clicked * 5, 10);
      if (engagement_data.replies_count) engagementScore += Math.min(engagement_data.replies_count * 5, 15);
      if (engagement_data.last_activity) {
        const daysSinceActivity = Math.floor(
          (Date.now() - new Date(engagement_data.last_activity).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceActivity <= 1) engagementScore += 5;
        else if (daysSinceActivity <= 3) engagementScore += 3;
      }
    }

    // Urgency scoring (0-25 points)
    if (urgency_signals) {
      if (urgency_signals.timeline_mentioned) urgencyScore += 10;
      if (urgency_signals.insurance_claim) urgencyScore += 15;
      if (urgency_signals.keywords) {
        const urgentKeywords = ["urgent", "asap", "immediately", "leak", "damage", "emergency"];
        const foundKeywords = urgency_signals.keywords.filter((k) =>
          urgentKeywords.some((uk) => k.toLowerCase().includes(uk))
        );
        urgencyScore += Math.min(foundKeywords.length * 3, 10);
      }
    }

    // Home value scoring (0-15 points)
    if (home_value) {
      if (home_value >= 500000) valueScore = 15;
      else if (home_value >= 300000) valueScore = 10;
      else if (home_value >= 200000) valueScore = 7;
      else valueScore = 5;
    }

    // Call responsiveness scoring (0-15 points)
    if (call_responsiveness === "high") responsivenessScore = 15;
    else if (call_responsiveness === "medium") responsivenessScore = 10;
    else if (call_responsiveness === "low") responsivenessScore = 5;

    // Budget signals scoring (0-20 points)
    if (budget_signals) {
      if (budget_signals.mentioned_budget) budgetScore += 8;
      if (budget_signals.financing_interest) budgetScore += 7;
      if (!budget_signals.price_sensitive) budgetScore += 5; // Not price sensitive = good
    }

    // AI-enhanced scoring
    let aiScore = 0;
    let aiReasoning = "";

    if (conversationHistory) {
      try {
        const aiPrompt = `You are a lead scoring expert for roofing companies. Analyze this lead conversation and provide a score (0-100).

Lead Information:
- Name: ${lead.first_name || ""} ${lead.last_name || ""}
- Email: ${lead.email}
- Address: ${lead.address || "unknown"}

Conversation History:
${conversationHistory.substring(0, 2000)}

Scoring Factors:
1. Engagement level (emails opened, replies, clicks)
2. Urgency signals (timeline, insurance claim, damage mentions)
3. Home value indicators
4. Call responsiveness
5. Budget signals
6. Previous contractor work

Return JSON:
{
  "score": 0-100,
  "category": "HOT|WARM|COLD",
  "reasoning": "Brief explanation of score",
  "key_signals": ["signal1", "signal2"]
}`;

        const aiResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a lead scoring expert. Analyze conversations and provide accurate lead scores. Always return valid JSON.",
            },
            { role: "user", content: aiPrompt },
          ],
          temperature: 0.3,
          response_format: { type: "json_object" },
        });

        const aiContent = aiResponse.choices[0]?.message?.content;
        if (aiContent) {
          const aiData = JSON.parse(aiContent);
          aiScore = aiData.score || 0;
          aiReasoning = aiData.reasoning || "";
        }
      } catch (aiError) {
        console.error("AI scoring error:", aiError);
      }
    }

    // Combine scores (weighted: 60% rule-based, 40% AI)
    const ruleBasedScore = engagementScore + urgencyScore + valueScore + responsivenessScore + budgetScore;
    const finalScore = Math.round(ruleBasedScore * 0.6 + aiScore * 0.4);

    // Determine category
    let category: "HOT" | "WARM" | "COLD";
    if (finalScore >= 90) category = "HOT";
    else if (finalScore >= 70) category = "WARM";
    else category = "COLD";

    // Update lead with score
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        lead_score: finalScore,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead_id);

    if (updateError) {
      console.error("Error updating lead score:", updateError);
    }

    return NextResponse.json({
      success: true,
      score: finalScore,
      category,
      breakdown: {
        engagement: engagementScore,
        urgency: urgencyScore,
        value: valueScore,
        responsiveness: responsivenessScore,
        budget: budgetScore,
        ai_enhanced: aiScore,
        rule_based: ruleBasedScore,
      },
      reasoning: aiReasoning || `Lead scored ${finalScore} based on engagement, urgency, value, and budget signals.`,
      recommendations: finalScore >= 90
        ? ["Prioritize immediate follow-up", "Assign to top rep", "Send proposal ASAP"]
        : finalScore >= 70
        ? ["Follow up within 24 hours", "Send estimate", "Schedule call"]
        : ["Add to nurture sequence", "Monitor for engagement", "Follow up weekly"],
    });
  } catch (error: any) {
    console.error("Error in lead scoring:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















