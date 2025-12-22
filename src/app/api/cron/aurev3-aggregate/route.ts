import { NextRequest, NextResponse } from 'next/server'
import { CommandFabric } from '@/lib/aurev3/command-fabric'

/**
 * POST /api/cron/aurev3-aggregate
 * Nightly model aggregation cron job
 * Should be called daily at scheduled time
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const fabric = new CommandFabric()
    await fabric.triggerNightlyAggregation()

    return NextResponse.json({
      success: true,
      message: 'Nightly aggregation triggered',
    })
  } catch (error) {
    console.error('Error in nightly aggregation:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Aggregation failed' },
      { status: 500 }
    )
  }
}







