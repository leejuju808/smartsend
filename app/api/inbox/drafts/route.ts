// Block 19850 — Inbox AI Auto-Responder v1
// API endpoints for managing auto-draft replies

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// GET /api/inbox/drafts?thread_id=xxx
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("thread_id");

    if (!threadId) {
      return NextResponse.json({ error: "thread_id required" }, { status: 400 });
    }

    // Get latest pending draft for thread
    const { data: draft, error } = await supabase
      .from("auto_draft_replies")
      .select("*")
      .eq("thread_id", threadId)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching draft:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ draft });
  } catch (error: any) {
    console.error("Error in GET /api/inbox/drafts:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/inbox/drafts - Create or regenerate draft
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { thread_id, message_id, regenerate } = body;

    if (!thread_id) {
      return NextResponse.json({ error: "thread_id required" }, { status: 400 });
    }

    // Get thread and latest message
    const { data: thread } = await supabase
      .from("inbox_threads")
      .select("*")
      .eq("id", thread_id)
      .single();

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Get latest inbound message
    const messageId = message_id || null;
    let message;

    if (messageId) {
      const { data: msg } = await supabase
        .from("inbox_messages")
        .select("*")
        .eq("id", messageId)
        .single();
      message = msg;
    } else {
      const { data: messages } = await supabase
        .from("inbox_messages")
        .select("*")
        .eq("thread_id", thread_id)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(1);
      message = messages?.[0];
    }

    if (!message) {
      return NextResponse.json({ error: "No inbound message found" }, { status: 404 });
    }

    // Get user settings
    const { data: settings } = await supabase
      .from("inbox_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    // Check if AI drafting is enabled
    if (!settings?.ai_drafting_enabled) {
      return NextResponse.json({ error: "AI drafting is disabled" }, { status: 403 });
    }

    // Import AI functions (dynamic import to avoid edge function issues)
    const { generateAutoDraft } = await import("@/lib/ai/autoResponder");
    const { analyzeReplyIntelligence } = await import("@/lib/ai/replyBrainV2");

    // Analyze message
    const messageText = message.body_html?.replace(/<[^>]+>/g, " ") || message.body_text || "";
    const intelligence = await analyzeReplyIntelligence(messageText, message.subject || undefined);

    // Check confidence threshold
    const minConfidence = settings.ai_draft_confidence_minimum || 0.70;
    if (intelligence.confidence < minConfidence) {
      return NextResponse.json({
        error: "Confidence below threshold",
        confidence: intelligence.confidence,
        minimum: minConfidence,
      }, { status: 400 });
    }

    // Generate draft
    const draftResult = await generateAutoDraft(
      messageText,
      message.subject || null,
      intelligence,
      {
        tone: settings.ai_reply_tone_default as "direct" | "friendly" | "professional",
      }
    );

    // Create draft in database
    const { data: draft, error: draftError } = await supabase.rpc("create_auto_draft", {
      p_thread_id: thread_id,
      p_message_id: message.id,
      p_ai_reply_text: draftResult.replyText,
      p_ai_reply_subject: draftResult.replySubject || null,
      p_confidence: draftResult.confidence,
      p_reason: draftResult.reason,
      p_category: draftResult.category,
      p_tone: draftResult.tone,
      p_variants: JSON.stringify(draftResult.variants),
    });

    if (draftError) {
      console.error("Error creating draft:", draftError);
      return NextResponse.json({ error: draftError.message }, { status: 500 });
    }

    return NextResponse.json({
      draft: {
        id: draft,
        ...draftResult,
      },
    });
  } catch (error: any) {
    console.error("Error in POST /api/inbox/drafts:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/inbox/drafts/:id - Reject/delete draft
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const draftId = searchParams.get("id");

    if (!draftId) {
      return NextResponse.json({ error: "draft id required" }, { status: 400 });
    }

    // Mark draft as rejected
    const { error } = await supabase
      .from("auto_draft_replies")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", draftId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Error rejecting draft:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log rejection
    const { data: draft } = await supabase
      .from("auto_draft_replies")
      .select("thread_id")
      .eq("id", draftId)
      .single();

    if (draft) {
      await supabase.from("auto_reply_logs").insert({
        thread_id: draft.thread_id,
        user_id: user.id,
        draft_id: draftId,
        action_type: "draft_rejected",
        ai_text: "Draft rejected by user",
        confidence: 0,
        reason: "User rejected draft",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/inbox/drafts:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}



















































