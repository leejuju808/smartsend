import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { blockIfAutopilotEnabled } from "@/lib/autopilot/guard";

export async function POST(
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
    const body = await req.json()
    const { isPaused, reason } = body

    if (typeof isPaused !== 'boolean') {
      return NextResponse.json(
        { error: 'isPaused must be a boolean' },
        { status: 400 }
      )
    }

    // BLOCK 269600 — SmartSend Enforcement Sprint:
    // Pausing requires a reason (dropdown in UI, enforced server-side).
    const allowedPauseReasons = [
      'deliverability_issue',
      'no_leads',
      'seasonal_break',
      'vacation',
      'other',
    ] as const

    if (isPaused) {
      const r = String(reason || '').trim()
      if (!allowedPauseReasons.includes(r as any)) {
        return NextResponse.json(
          { error: 'pause reason required' },
          { status: 400 }
        )
      }
    }

    // Get campaign to check ownership
    const { data: campaign, error: campErr } = await supabase
      .from('campaigns')
      .select('id, user_id, team_id, workspace_id')
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

    // BLOCK 273000 — AUTOPILOT: owner cannot pause/resume campaigns.
    const workspaceId = String((campaign as any)?.workspace_id || "");
    if (workspaceId) {
      const gate = await blockIfAutopilotEnabled({
        req,
        workspaceId,
        action: isPaused ? "Pause campaign" : "Resume campaign",
      });
      if (gate.blocked) return gate.response;
    }

    // Prefer canonical guard RPCs (handles schema differences across versions).
    if (isPaused) {
      const { error: rpcErr } = await supabase.rpc('guard_pause_campaign', {
        p_campaign: campaignId,
        p_reason: String(reason).trim(),
      })
      if (!rpcErr) {
        return NextResponse.json({
          ok: true,
          is_paused: true,
          message: 'Campaign paused',
        })
      }
    } else {
      const { error: rpcErr } = await supabase.rpc('guard_resume_campaign', {
        p_campaign: campaignId,
      })
      if (!rpcErr) {
        return NextResponse.json({
          ok: true,
          is_paused: false,
          message: 'Campaign resumed',
        })
      }
    }

    // Fallback: Update pause columns directly for older schemas.
    const updatePayload: any = isPaused
      ? { is_paused: true, paused: true, status: 'Paused', pause_reason: String(reason || '').trim() }
      : { is_paused: false, paused: false, status: 'Running', pause_reason: null }

    const { error: updateErr } = await supabase
      .from('campaigns')
      .update(updatePayload)
      .eq('id', campaignId)

    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      is_paused: isPaused,
      message: isPaused ? 'Campaign paused' : 'Campaign resumed',
    })
  } catch (error: any) {
    console.error('Pause toggle error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
