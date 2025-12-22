import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    // Get authenticated user
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()
    
    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const campaignId = params.id

    // Get campaign to check ownership
    const { data: campaign, error: campErr } = await supabase
      .from('campaigns')
      .select('id, user_id, team_id, is_paused')
      .eq('id', campaignId)
      .maybeSingle()

    if (campErr || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Check access
    let hasAccess = false
    if (campaign.user_id === user.id) {
      hasAccess = true
    } else if (campaign.team_id) {
      const { data: teamMember } = await supabase
        .from('team_members')
        .select('id')
        .eq('team_id', campaign.team_id)
        .eq('user_id', user.id)
        .maybeSingle()
      hasAccess = !!teamMember
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get queue stats
    const { data: queuedData, error: queuedErr } = await supabase
      .from('send_queue')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')

    const { data: sentData, error: sentErr } = await supabase
      .from('send_queue')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'sent')
      .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    const { data: errorData, error: errorErr } = await supabase
      .from('send_queue')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'error')

    const { count: canceledCount, error: canceledErr } = await supabase
      .from('send_queue')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'canceled')

    // Get sent today from send_logs
    const { count: sentTodayCount, error: sentTodayErr } = await supabase
      .from('send_logs')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'sent')
      .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    // Get failed count from send_logs
    const { count: failedCount, error: failedErr } = await supabase
      .from('send_logs')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'failed')

    return NextResponse.json({
      queued: queuedData?.length ?? 0,
      sending: 0, // You can add a query for 'sending' status if needed
      sent_today: sentTodayCount ?? 0,
      failed: failedCount ?? 0,
      canceled: canceledCount ?? 0,
      errors: errorData?.length ?? 0,
      is_paused: campaign.is_paused ?? false,
    })
  } catch (error: any) {
    console.error('Queue stats error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

