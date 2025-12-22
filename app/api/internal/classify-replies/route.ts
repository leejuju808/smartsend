// app/api/internal/classify-replies/route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const FUNCTIONS_BASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ??
  `${SUPABASE_URL}/functions/v1`;

export async function POST() {
  try {
    // 1) Fetch a batch of unclassified replies
    const { data: rows, error: rpcError } =
      await supabaseAdmin.rpc("get_unclassified_reply_ids", {
        p_limit: 50,
      });

    if (rpcError) {
      console.error("get_unclassified_reply_ids error:", rpcError);
      return NextResponse.json(
        { error: "Failed to load unclassified replies" },
        { status: 500 }
      );
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        ok: true,
        classified: 0,
        message: "No replies waiting for classification",
      });
    }

    const replyIds: string[] = rows.map((r: any) => r.reply_id);

    // 2) Call the Edge Function classifier
    const res = await fetch(`${FUNCTIONS_BASE_URL}/reply-intent-classifier`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // no Authorization header because we used --no-verify-jwt on deploy
      },
      body: JSON.stringify({ reply_ids: replyIds }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(
        "reply-intent-classifier error:",
        res.status,
        res.statusText,
        text
      );
      return NextResponse.json(
        { error: "Classifier call failed", details: text },
        { status: 500 }
      );
    }

    const payload = await res.json();

    // 3) Mark them as "needs_intent = false"
    const { error: updateError } = await supabaseAdmin
      .from("email_replies")
      .update({ needs_intent: false })
      .in("id", replyIds);

    if (updateError) {
      console.error("Failed to update needs_intent flags:", updateError);
      return NextResponse.json(
        {
          error: "Failed to update needs_intent flags",
          details: updateError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      classified: payload.classified ?? replyIds.length,
      total_requested: payload.total_requested ?? replyIds.length,
    });
  } catch (err: any) {
    console.error("Internal classify-replies job error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}


























































