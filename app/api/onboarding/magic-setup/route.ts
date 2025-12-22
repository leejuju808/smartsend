import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { workspaceId } = await req.json()

    // Get workspace_id if not provided
    let wsId = workspaceId
    if (!wsId) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()
      
      wsId = membership?.workspace_id
    }

    if (!wsId) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 400 })
    }

    // Create example segment
    const { data: segment, error: segmentError } = await supabase
      .from('segments')
      .insert({
        workspace_id: wsId,
        name: 'Example Segment - SaaS Founders',
        description: 'Created by Magic Setup',
        filters: JSON.stringify({
          industry: 'SaaS',
          company_size: '10-50',
        }),
      })
      .select()
      .single()

    if (segmentError) {
      console.error('Error creating segment:', segmentError)
    }

    // Create sample campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        workspace_id: wsId,
        name: 'Example Campaign - Welcome Sequence',
        status: 'draft',
        from_email_account_id: null, // Will need to be set by user
      })
      .select()
      .single()

    if (campaignError) {
      console.error('Error creating campaign:', campaignError)
      return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
    }

    // Create 3-email sequence
    const sequenceSteps = [
      {
        campaign_id: campaign.id,
        step_number: 1,
        subject: 'Quick question about {{company_name}}',
        body: `Hi {{first_name}},\n\nI noticed {{company_name}} is in the {{industry}} space. Quick question: are you currently using {{tool_name}}?\n\nBest,\n{{sender_name}}`,
        delay_days: 0,
      },
      {
        campaign_id: campaign.id,
        step_number: 2,
        subject: 'Following up',
        body: `Hi {{first_name}},\n\nJust wanted to follow up on my previous email. Would love to hear your thoughts.\n\nBest,\n{{sender_name}}`,
        delay_days: 2,
      },
      {
        campaign_id: campaign.id,
        step_number: 3,
        subject: 'Last try',
        body: `Hi {{first_name}},\n\nI understand you're busy. If this isn't a good time, no worries at all.\n\nBest,\n{{sender_name}}`,
        delay_days: 5,
      },
    ]

    const { error: sequenceError } = await supabase
      .from('campaign_steps')
      .insert(sequenceSteps)

    if (sequenceError) {
      console.error('Error creating sequence:', sequenceError)
    }

    return NextResponse.json({
      ok: true,
      campaignId: campaign.id,
      segmentId: segment?.id,
    })
  } catch (error: any) {
    console.error('Error in magic-setup:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}









