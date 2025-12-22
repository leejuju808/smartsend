// Block 254300 — SmartSend Sales Acceleration Engine v1
// AI Sales Coaching API
// POST /api/sales/coaching

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

interface CoachingRequest {
  question: string;
  context?: {
    lead_id?: string;
    estimate_id?: string;
    job_type?: string;
    squares?: number;
    price?: number;
    lead_score?: number;
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

    const body: CoachingRequest = await req.json();
    const { question, context } = body;

    if (!question) {
      return NextResponse.json({ error: "Question required" }, { status: 400 });
    }

    // Get context data if lead_id provided
    let leadContext = "";
    if (context?.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("*")
        .eq("id", context.lead_id)
        .single();

      if (lead) {
        leadContext = `
Lead Information:
- Name: ${lead.customer_name || lead.first_name || ""}
- Address: ${lead.address || "unknown"}
- Lead Score: ${lead.lead_score || "N/A"}
- Status: ${lead.sales_status || "unknown"}
`;
      }
    }

    // Get estimate context if estimate_id provided
    let estimateContext = "";
    if (context?.estimate_id) {
      const { data: estimate } = await supabase
        .from("estimates")
        .select("*")
        .eq("id", context.estimate_id)
        .single();

      if (estimate) {
        estimateContext = `
Estimate Details:
- Job Type: ${estimate.job_type}
- Squares: ${estimate.squares}
- Pitch: ${estimate.pitch}
- Material: ${estimate.material_system}
- Price: $${estimate.price}
`;
      }
    }

    const systemPrompt = `You are SmartSend's AI Sales Coach for roofing companies. You help sales reps with:

1. Pricing strategies
2. Objection handling
3. Upsell recommendations
4. Communication best practices
5. Closing techniques

You provide practical, actionable advice based on roofing industry best practices. Be concise, specific, and helpful.`;

    const userPrompt = `${leadContext}${estimateContext}

Context:
${context ? JSON.stringify(context, null, 2) : "No additional context"}

Question: ${question}

Provide helpful, actionable coaching advice.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content || "I couldn't generate a response. Please try again.";

    return NextResponse.json({
      success: true,
      question,
      answer: response,
      context: context || null,
    });
  } catch (error: any) {
    console.error("Error in AI coaching:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















