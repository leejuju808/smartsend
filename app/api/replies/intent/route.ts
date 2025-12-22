// app/api/replies/intent/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

type UiIntent = "hot" | "warm" | "not_interested" | "unclassified";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  try {
    const { replyId, intent } = (await req.json()) as {
      replyId?: string;
      intent?: UiIntent;
    };

    if (!replyId || !intent) {
      return NextResponse.json(
        { error: "Missing replyId or intent" },
        { status: 400 }
      );
    }

    const allowedIntents: UiIntent[] = [
      "hot",
      "warm",
      "not_interested",
      "unclassified",
    ];

    if (!allowedIntents.includes(intent)) {
      return NextResponse.json(
        { error: "Invalid intent value" },
        { status: 400 }
      );
    }

    if (intent === "unclassified") {
      // Clear + let AI re-classify later
      const { error } = await supabase.rpc("clear_reply_intent", {
        p_reply_id: replyId,
      });

      if (error) {
        console.error("clear_reply_intent error:", error);
        return NextResponse.json(
          { error: "Failed to clear intent", details: error.message },
          { status: 500 }
        );
      }
    } else {
      // Manual override to hot / warm / not_interested
      const { error } = await supabase.rpc("set_reply_intent", {
        p_reply_id: replyId,
        p_intent: intent,
      });

      if (error) {
        console.error("set_reply_intent error:", error);
        return NextResponse.json(
          { error: "Failed to set intent", details: error.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("POST /api/replies/intent error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}


























































