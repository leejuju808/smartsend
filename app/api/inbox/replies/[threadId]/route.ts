// Block 19600 — SmartSend Owner Inbox v1
// API endpoint for reply detail with lead card data

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const threadId = params.threadId;

    // Get thread with all messages
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select(`
        *,
        campaign:campaigns(id, name),
        lead:leads(id, name, email, phone, address, tags)
      `)
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Get all messages in thread
    const { data: messages, error: messagesError } = await supabase
      .from("inbox_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("sent_at", { ascending: true });

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return NextResponse.json({ error: messagesError.message }, { status: 500 });
    }

    // Get AI analysis if available
    const latestInboundMessage = messages
      ?.filter((m) => m.direction === "in")
      .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0];

    // Calculate follow-up timer (hours until recommended follow-up)
    let followUpTimerHours: number | null = null;
    if (thread.follow_up_timer_hours) {
      followUpTimerHours = thread.follow_up_timer_hours;
    } else if (latestInboundMessage?.ai_intent_tag === "hot_lead") {
      followUpTimerHours = 6; // HOT leads: respond within 6 hours
    } else if (latestInboundMessage?.ai_intent_tag === "warm_lead") {
      followUpTimerHours = 24; // WARM leads: respond within 24 hours
    }

    // Generate AI summary if not exists
    let aiSummary = latestInboundMessage?.ai_summary;
    if (!aiSummary && latestInboundMessage?.body) {
      // Simple summary generation (can be enhanced with AI later)
      const body = latestInboundMessage.body.substring(0, 200);
      aiSummary = body.length > 200 ? body + "..." : body;
    }

    // Generate recommended response if not exists
    let recommendedResponse = latestInboundMessage?.ai_recommended_response;
    if (!recommendedResponse && latestInboundMessage?.ai_intent_tag) {
      // Simple template-based response (can be enhanced with AI later)
      switch (latestInboundMessage.ai_intent_tag) {
        case "hot_lead":
          recommendedResponse = "Thank you for your interest! I'd be happy to schedule a free inspection. When would be a good time for you this week?";
          break;
        case "warm_lead":
          recommendedResponse = "Thanks for reaching out! I'd love to answer your questions. What would you like to know more about?";
          break;
        case "follow_up_needed":
          recommendedResponse = "I noticed you had a question. How can I help clarify things for you?";
          break;
        default:
          recommendedResponse = "Thank you for your message. How can I assist you today?";
      }
    }

    return NextResponse.json({
      thread: {
        ...thread,
        followUpTimerHours,
      },
      messages: messages || [],
      leadCard: {
        homeownerName: thread.homeowner_name || thread.lead?.name || "Unknown",
        homeownerEmail: thread.homeowner_email || thread.lead?.email || "",
        phone: thread.lead?.phone || null,
        address: thread.lead?.address || null,
        messageThread: messages || [],
        aiSummary,
        recommendedResponse,
        leadValueRange: thread.lead_value_range || "TBD",
        followUpTimerHours,
        leadRankingScore: thread.lead_ranking_score || 0,
        aiIntentTag: latestInboundMessage?.ai_intent_tag || null,
        tags: thread.lead?.tags || [],
      },
    });
  } catch (error: any) {
    console.error("Error in inbox reply detail API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
