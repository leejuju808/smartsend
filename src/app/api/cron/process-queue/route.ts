// /app/api/cron/process-queue/route.ts
import { NextRequest, NextResponse } from "next/server";
import { processQueue } from "@/lib/scheduler/processQueue";

export async function POST(req: NextRequest) {
  try {
    // Verify this is a cron job (optional security)
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log('Starting queue processing...');
    await processQueue();
    console.log('Queue processing completed');
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in queue processing:', error);
    return NextResponse.json(
      { error: 'Queue processing failed' },
      { status: 500 }
    );
  }
}