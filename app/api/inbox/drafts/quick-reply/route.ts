// Block 19850 — Inbox AI Auto-Responder v1
// API endpoint for generating quick reply buttons

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { generateQuickReply, QuickReplyType } from "@/lib/ai/autoResponder";

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { thread_id, quick_reply_type, message_text } = body;

    if (!thread_id || !quick_reply_type || !message_text) {
      return NextResponse.json(
        { error: "thread_id, quick_reply_type, and message_text required" },
        { status: 400 }
      );
    }

    // Validate quick reply type
    const validTypes: QuickReplyType[] = ["yes", "schedule", "pricing", "address", "call", "photos"];
    if (!validTypes.includes(quick_reply_type)) {
      return NextResponse.json({ error: "Invalid quick_reply_type" }, { status: 400 });
    }

    // Get lead name for personalization
    const { data: thread } = await supabase
      .from("inbox_threads")
      .select("lead_id")
      .eq("id", thread_id)
      .single();

    let leadName: string | undefined;
    if (thread?.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("first_name, last_name")
        .eq("id", thread.lead_id)
        .single();
      if (lead) {
        leadName = `${lead.first_name || ""} ${lead.last_name || ""}`.trim();
      }
    }

    // Generate quick reply
    const replyText = await generateQuickReply(
      quick_reply_type,
      message_text,
      {
        category: "has_question",
        confidence: 0.8,
        emotionalTone: "neutral",
        toneConfidence: 0.7,
        extractedQuestions: [],
        hasInsuranceIntent: false,
        insuranceKeywords: [],
        insuranceConfidence: 0,
        hasBookingIntent: false,
        bookingConfidence: 0,
        hasObjection: false,
        hasUrgentDamage: false,
        damageKeywords: [],
        urgencyScore: 0,
        suggestedActions: [],
        suggestedReplyTemplates: [],
        suggestedPipelineStage: "WARM",
        suggestedTags: [],
        rawAiResponse: {},
        reasoning: "Quick reply generation",
      },
      leadName
    );

    return NextResponse.json({ reply_text: replyText });
  } catch (error: any) {
    console.error("Error in POST /api/inbox/drafts/quick-reply:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}



















































