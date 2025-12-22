import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/logger";

/**
 * GET /api/log/test
 * 
 * Test endpoint to verify logging is working
 */
export async function GET(req: NextRequest) {
  try {
    // Test all log levels
    await log.info('general', 'Test info log from /api/log/test', {
      test: true,
      timestamp: new Date().toISOString(),
    });

    await log.warn('general', 'Test warn log from /api/log/test', {
      test: true,
      timestamp: new Date().toISOString(),
    });

    await log.error(
      'general',
      'Test error log from /api/log/test',
      {
        test: true,
        timestamp: new Date().toISOString(),
      },
      undefined,
      new Error('Test error stack trace')
    );

    return NextResponse.json({
      success: true,
      message: 'Test logs written successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

