// Internal Handoff API Route
// Handles handoff requests from edge functions (service role)

import { NextRequest, NextResponse } from "next/server";
import { triggerHandoffInternal } from "@/lib/handoff/internal";

export async function POST(req: NextRequest) {
  try {
    // Verify internal API key
    const internalKey = req.headers.get("X-Internal-Key");
    const expectedKey = process.env.INTERNAL_API_KEY;
    
    if (!expectedKey || internalKey !== expectedKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { threadId } = await req.json();
    if (!threadId) {
      return NextResponse.json({ error: "threadId is required" }, { status: 400 });
    }

    // Trigger handoff (non-blocking)
    triggerHandoffInternal(threadId).catch((err) => 
      console.error("Handoff error:", err)
    );

    return NextResponse.json({ ok: true, message: "Handoff triggered" });
  } catch (error: any) {
    console.error("Internal handoff error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}












