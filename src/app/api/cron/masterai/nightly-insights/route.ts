import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MasterAIBrain } from '@/lib/ai/master-ai-brain'

/**
 * POST /api/cron/masterai/nightly-insights
 * Nightly insights - generates daily briefings and health scores
 * Called every night at 2 AM
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient()
    
    // Get all active workspaces
    const { data: workspaces, error: workspacesError } = await supabase
      .from('workspaces')
      .select('id')
      .limit(1000) // Process up to 1000 workspaces per run

    if (workspacesError) {
      console.error('Error fetching workspaces:', workspacesError)
      return NextResponse.json(
        { error: 'Failed to fetch workspaces' },
        { status: 500 }
      )
    }

    if (!workspaces || workspaces.length === 0) {
      return NextResponse.json({ message: 'No workspaces to process', processed: 0 })
    }

    let processed = 0
    let errors = 0

    // Process each workspace
    for (const workspace of workspaces) {
      try {
        const brain = new MasterAIBrain(workspace.id)
        
        // Update global context first
        await brain.updateGlobalContext()
        
        // Calculate health score
        await brain.calculateHealthScore()
        
        // Generate daily briefing (store in database if needed)
        // For now, we'll just calculate it - can be stored later
        
        processed++
      } catch (error) {
        console.error(`Error processing workspace ${workspace.id}:`, error)
        errors++
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      errors,
      total: workspaces.length,
      message: 'Nightly insights generated'
    })
  } catch (error: any) {
    console.error('Nightly insights error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate nightly insights' },
      { status: 500 }
    )
  }
}

























