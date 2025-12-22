/**
 * Cron Job: Process Send Waves
 * Runs periodically to execute due send waves
 */

import { NextRequest, NextResponse } from 'next/server';
import { processDueWaves } from '@/lib/smart-send/wave-executor';

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret if needed
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await processDueWaves();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error processing waves:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}



























