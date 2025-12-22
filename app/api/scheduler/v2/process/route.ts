/**
 * Block 24140 — Advanced Scheduler v2
 * Queue Processing Endpoint
 * 
 * Processes the send queue using Advanced Scheduler v2
 * This should be called by a cron job every minute
 */

import { NextResponse } from "next/server";
import { processQueueV2 } from "@/lib/scheduler/v2/processQueueV2";

export async function POST() {
  try {
    const result = await processQueueV2();

    return NextResponse.json({
      ok: true,
      processed: result.processed,
      workspaces: result.workspaces,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error processing queue:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Failed to process queue",
      },
      { status: 500 }
    );
  }
}






































