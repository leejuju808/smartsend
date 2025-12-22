// Block 21823 — SmartSend Roofing Homeowner Tone Intent Engine v1
// API route to trigger homeowner message classification

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { classifyHomeownerMessage } from "@/lib/homeowner-classification";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { activity_id } = await req.json();

    if (!activity_id) {
      return NextResponse.json(
        { error: "activity_id is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the activity
    const { data: activity, error } = await supabase
      .from("lead_activities")
      .select("id, kind, body, homeowner_tone, homeowner_intent")
      .eq("id", activity_id)
      .single();

    if (error || !activity) {
      return NextResponse.json(
        { error: "Activity not found" },
        { status: 404 }
      );
    }

    // Only classify message_in activities
    if (activity.kind !== "message_in") {
      return NextResponse.json(
        { error: "Activity is not a message_in type" },
        { status: 400 }
      );
    }

    // Skip if already classified
    if (activity.homeowner_tone && activity.homeowner_intent) {
      return NextResponse.json({
        tone: activity.homeowner_tone,
        intent: activity.homeowner_intent,
        already_classified: true,
      });
    }

    // Skip if no body text
    if (!activity.body || activity.body.trim() === "") {
      return NextResponse.json(
        { error: "Activity has no body text to classify" },
        { status: 400 }
      );
    }

    // Classify the message
    const result = await classifyHomeownerMessage(activity_id, activity.body);

    if (!result) {
      return NextResponse.json(
        { error: "Failed to classify message" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      tone: result.tone,
      intent: result.intent,
      activity_id,
    });
  } catch (error) {
    console.error("Error classifying homeowner message:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}









































