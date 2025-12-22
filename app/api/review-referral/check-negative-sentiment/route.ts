import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/review-referral/check-negative-sentiment
 * Block 24540: Checks for negative sentiment in homeowner replies
 * Should be called when a reply is detected for a lead with an active review/referral sequence
 */
export async function POST(req: NextRequest) {
  try {
    const { lead_id, message_text, sentiment_score } = await req.json();

    if (!lead_id || !message_text) {
      return NextResponse.json(
        { error: "lead_id and message_text are required" },
        { status: 400 }
      );
    }

    // Call the database function to detect negative sentiment
    const { data: isNegative, error } = await supabase.rpc(
      "detect_negative_sentiment",
      {
        p_lead_id: lead_id,
        p_message_text: message_text,
        p_sentiment_score: sentiment_score || null,
      }
    );

    if (error) {
      console.error("Error detecting negative sentiment:", error);
      return NextResponse.json(
        { error: "Failed to detect negative sentiment" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      is_negative: isNegative,
      action_taken: isNegative ? "sequence_cancelled" : "none",
    });
  } catch (error: any) {
    console.error("Negative sentiment check error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check negative sentiment" },
      { status: 500 }
    );
  }
}






































