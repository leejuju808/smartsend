// Block 35333 — Revival Engine Cron Job
// Runs periodically to detect dead leads and send scheduled revival messages

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = process.env.CRON_SECRET;
    
    if (expectedSecret && cronSecret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Step 1: Detect dead leads
    const detectResponse = await fetch(`${baseUrl}/api/revival/detect-dead-leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": expectedSecret || "",
      },
    });

    const detectResult = await detectResponse.json();
    console.log("Dead leads detected:", detectResult);

    // Step 2: Send scheduled Level 1 revival messages (immediate)
    const scheduleResponse = await fetch(`${baseUrl}/api/revival/schedule-sequence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": expectedSecret || "",
      },
      body: JSON.stringify({
        sequenceLevel: 1,
      }),
    });

    const scheduleResult = await scheduleResponse.json();
    console.log("Revival sequences scheduled:", scheduleResult);

    // Step 3: Send any due scheduled messages (Levels 2-4)
    // This would check for scheduled sequences where sent_at is null and scheduled time has passed
    // For now, we'll just log that this step would run

    return NextResponse.json({
      success: true,
      deadLeadsDetected: detectResult.processed || 0,
      revivalMessagesSent: scheduleResult.scheduled || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error in revival engine cron:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

// Allow POST as well
export async function POST(req: NextRequest) {
  return GET(req);
}
































