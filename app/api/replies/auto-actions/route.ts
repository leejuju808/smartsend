// Block 300 — Adaptive Reply Brain v2
// Auto-actions API route

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processReplyIntentAutoActions } from "@/app/jobs/reply_auto_actions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { intent_id } = await req.json();

    if (!intent_id) {
      return NextResponse.json({ error: "Missing intent_id" }, { status: 400 });
    }

    const result = await processReplyIntentAutoActions(intent_id);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error processing auto-actions:", error);
    return NextResponse.json(
      { error: error?.message || String(error) },
      { status: 500 }
    );
  }
}








