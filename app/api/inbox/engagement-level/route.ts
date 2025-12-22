// Block 20320 — Engagement Level Calculator API

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { conversation_id } = body;

    if (!conversation_id) {
      return NextResponse.json(
        { error: "conversation_id required" },
        { status: 400 }
      );
    }

    // 1) Load conversation
    const { data: convo, error } = await supabase
      .from("inbox_threads")
      .select(
        `
        id,
        email_open_count,
        email_click_count,
        reply_count,
        last_contact_at,
        last_open_at,
        last_click_at,
        engagement_score,
        engagement_level
      `
      )
      .eq("id", conversation_id)
      .single();

    if (error || !convo) {
      console.error("Engagement level load error", error);
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // 2) Calculate score
    const openCount = convo.email_open_count ?? 0;
    const clickCount = convo.email_click_count ?? 0;
    const replyCount = convo.reply_count ?? 0;

    const lastOpenDays = daysSince(convo.last_open_at) ?? 999;
    const lastClickDays = daysSince(convo.last_click_at) ?? 999;
    const lastContactDays = daysSince(convo.last_contact_at) ?? 999;

    let score = 0;

    // Basic scoring rules
    score += openCount * 5;
    score += clickCount * 15;
    score += replyCount * 25;

    if (lastOpenDays <= 2) score += 10;
    if (lastClickDays <= 2) score += 15;
    if (lastContactDays <= 1) score += 20;

    if (lastContactDays >= 5) score -= 20;
    if (lastOpenDays >= 7) score -= 10;

    if (score < 0) score = 0;

    // 3) Level assignment (adjustable)
    let level: "cold" | "warm" | "hot" = "cold";
    if (score >= 120) level = "hot";
    else if (score >= 40) level = "warm";

    // 4) Update DB
    const { data: updated, error: updateErr } = await supabase
      .from("inbox_threads")
      .update({
        engagement_score: score,
        engagement_level: level,
      })
      .eq("id", conversation_id)
      .select()
      .single();

    if (updateErr) {
      console.error("Engagement update error", updateErr);
      return NextResponse.json(
        { error: "Failed to update engagement level" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      conversation: updated,
      engagement_score: score,
      engagement_level: level,
    });
  } catch (error: any) {
    console.error("Error in engagement-level route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

















































