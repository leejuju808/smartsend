import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { campaign_id, action, feedback } = await request.json()
    
    if (!campaign_id || !action) {
      return NextResponse.json({ error: 'Campaign ID and action are required' }, { status: 400 })
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Action must be approve or reject' }, { status: 400 })
    }

    const supabase = createRouteHandlerClient({ cookies })
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get campaign and verify user has approval permissions
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('workspace_id, approval_status')
      .eq('id', campaign_id)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.approval_status !== 'pending_approval') {
      return NextResponse.json({ error: 'Campaign is not pending approval' }, { status: 400 })
    }

    // Check if user has approval permissions
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', campaign.workspace_id)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Update campaign approval status
    const approvalStatus = action === 'approve' ? 'approved' : 'rejected'
    const updateData: any = {
      approval_status: approvalStatus,
      approved_by: user.id,
      approved_at: new Date().toISOString()
    }

    const { data: updatedCampaign, error } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', campaign_id)
      .select()
      .single()

    if (error) throw error

    // Log team activity
    await supabase.rpc('log_team_activity', {
      p_workspace_id: campaign.workspace_id,
      p_action: action === 'approve' ? 'approved_campaign' : 'rejected_campaign',
      p_entity_type: 'campaign',
      p_entity_id: campaign_id,
      p_details: { 
        action,
        feedback: feedback || null,
        previous_status: campaign.approval_status
      }
    })

    return NextResponse.json({ campaign: updatedCampaign })
  } catch (error) {
    console.error('Error updating campaign approval:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 