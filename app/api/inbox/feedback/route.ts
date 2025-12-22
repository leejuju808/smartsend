// app/api/inbox/feedback/route.ts
// Block 19760 — Inbox Success Tracking & Feedback Loop v1
// API endpoint for submitting feedback

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      trigger_moment,
      question_1_confusion,
      question_2_help,
      question_3_improvement,
      question_3_other_text,
      metadata = {},
    } = body;

    if (!trigger_moment) {
      return NextResponse.json(
        { error: "trigger_moment is required" },
        { status: 400 }
      );
    }

    // Get user's workspace_id if available
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    const workspace_id = workspaceMember?.workspace_id || null;

    // Insert feedback
    const { data, error } = await supabase
      .from("inbox_feedback")
      .insert({
        user_id: user.id,
        workspace_id,
        trigger_moment,
        question_1_confusion: question_1_confusion || null,
        question_2_help: question_2_help || null,
        question_3_improvement: question_3_improvement || null,
        question_3_other_text: question_3_other_text || null,
        metadata,
      })
      .select()
      .single();

    if (error) {
      console.error("Error submitting feedback:", error);
      return NextResponse.json(
        { error: error.message || "Failed to submit feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error in feedback submission:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const processed = searchParams.get("processed");
    const workspace_id = searchParams.get("workspace_id");

    let query = supabase
      .from("inbox_feedback")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (processed !== null) {
      query = query.eq("processed", processed === "true");
    }

    if (workspace_id) {
      query = query.eq("workspace_id", workspace_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching feedback:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error fetching feedback:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



















































