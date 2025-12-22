import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/safety/pause_campaigns
 * 
 * SmartSend Safety Net v1 - Auto-Pause Unsafe Campaigns
 * Automatically pauses campaigns that exceed safety thresholds
 * Can be called manually or via cron job
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Optional: Check for cron secret if called via cron
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Allow manual calls without secret, but log it
      console.log('Safety pause called without cron secret (manual call)');
    }

    // Use Safety Net's auto_pause_unsafe_campaigns function
    const { data: pausedCount, error } = await supabase.rpc('auto_pause_unsafe_campaigns');

    if (error) {
      console.error('Error auto-pausing campaigns:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      paused_count: pausedCount || 0,
      message: `Auto-paused ${pausedCount || 0} unsafe campaign(s)`
    });
  } catch (error: any) {
    console.error('Auto-pause campaigns error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















































