import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateDailyBriefing } from '@/lib/ai/owner-mode/daily-briefing'

/**
 * Daily Briefing Cron Job
 * Runs at 6 AM daily to generate CEO briefings for all workspaces
 * 
 * Schedule: 0 6 * * * (6 AM UTC daily)
 * Access: Protected by CRON_SECRET
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const cronSecret = req.nextUrl.searchParams.get('key')
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient()

    // Get all active workspaces
    const { data: workspaces, error: workspacesError } = await supabase
      .from('workspaces')
      .select('id')

    if (workspacesError) {
      console.error('Error fetching workspaces:', workspacesError)
      return NextResponse.json(
        { error: 'Failed to fetch workspaces' },
        { status: 500 }
      )
    }

    if (!workspaces || workspaces.length === 0) {
      return NextResponse.json({ 
        message: 'No workspaces found',
        generated: 0 
      })
    }

    // Generate briefings for each workspace
    const results = []
    for (const workspace of workspaces) {
      try {
        await generateDailyBriefing(workspace.id)
        results.push({ workspaceId: workspace.id, status: 'success' })
      } catch (error: any) {
        console.error(`Failed to generate briefing for workspace ${workspace.id}:`, error)
        results.push({ 
          workspaceId: workspace.id, 
          status: 'error', 
          error: error.message 
        })
      }
    }

    const successCount = results.filter(r => r.status === 'success').length

    return NextResponse.json({
      message: `Generated ${successCount} of ${workspaces.length} briefings`,
      total: workspaces.length,
      success: successCount,
      errors: results.filter(r => r.status === 'error').length,
      results,
    })
  } catch (error: any) {
    console.error('Daily briefing cron error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate briefings' },
      { status: 500 }
    )
  }
}

























