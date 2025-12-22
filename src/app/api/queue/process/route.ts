import { NextRequest, NextResponse } from "next/server";
import { processGlobalQueue } from "@/lib/scheduler/globalQueueWorker";

/**
 * API endpoint to trigger global queue processing
 * Can be called by cron job or manually
 */
export async function POST(req: NextRequest) {
  try {
    const result = await processGlobalQueue();
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    console.error("Queue processing error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to process queue" },
      { status: 500 }
    );
  }
}












