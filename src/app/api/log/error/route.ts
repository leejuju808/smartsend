import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/log/error
 * 
 * Receives unhandled errors from error boundary and logs them to system_logs
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      message,
      stack,
      userId,
      pathname,
      timestamp,
      userAgent,
      errorBoundary,
    } = body;

    // Get user from Supabase if userId provided
    let actor: string | undefined;
    if (userId) {
      try {
        const { data: { user } } = await supabase.auth.getUserById(userId);
        actor = user?.email || userId;
      } catch {
        actor = userId;
      }
    }

    // Log the error
    await log.error(
      'error',
      message || 'Unhandled error caught by error boundary',
      {
        user_id: userId,
        pathname,
        user_agent: userAgent,
        error_boundary: errorBoundary || true,
        timestamp: timestamp || new Date().toISOString(),
      },
      actor,
      stack ? new Error(stack) : undefined
    );

    return NextResponse.json({ success: true, logged: true });
  } catch (err: any) {
    // Even if logging fails, return success (don't create error loop)
    console.error('[Error Logger] Failed to log error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

