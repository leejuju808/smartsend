import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { nextBusinessMoment } from '@/lib/cadence/time'
import { mergeTemplate } from '@/lib/cadence/merge'

export async function POST(req: NextRequest) {
  try {
    const { sequenceId, lead } = await req.json() as {
      sequenceId: string
      lead: { email: string; first_name?: string; company?: string; campaign_id?: string }
    }

    if (!sequenceId || !lead?.email) {
      return NextResponse.json({ error: 'missing fields' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use service role for admin access
    const supabaseAdmin = (await import('@/lib/supabase/server')).createServiceClient()

    const { data: seq } = await supabaseAdmin
      .from('cadence_sequences')
      .select('*')
      .eq('id', sequenceId)
      .single()

    const { data: step0 } = await supabaseAdmin
      .from('cadence_steps')
      .select('*')
      .eq('sequence_id', sequenceId)
      .eq('step_index', 0)
      .single()

    if (!seq || !step0) {
      return NextResponse.json({ error: 'sequence/step not found' }, { status: 404 })
    }

    // Check suppression before enrolling
    const orgId = seq.org_id || seq.workspace_id || user.id || null
    const { data: blocked } = await supabaseAdmin.rpc('is_suppressed', {
      p_email: lead.email.toLowerCase(),
      p_org: orgId
    })

    if (blocked) {
      return NextResponse.json({ 
        error: 'suppressed', 
        suppressed: true 
      }, { status: 400 })
    }

    const { data: enroll, error: enrollError } = await supabaseAdmin
      .from('cadence_enrollments')
      .insert({
        sequence_id: sequenceId,
        lead_email: lead.email,
        lead_first_name: lead.first_name,
        lead_company: lead.company,
        campaign_id: lead.campaign_id,
        current_step: 0,
        status: 'active',
      })
      .select('*')
      .single()

    if (enrollError) {
      return NextResponse.json({ error: enrollError.message }, { status: 500 })
    }

    // schedule step 0
    const scheduledAt = nextBusinessMoment(
      new Date(),
      step0.wait_days,
      seq.timezone,
      { start: seq.daily_start, end: seq.daily_end },
      seq.quiet_weekends
    )
    const subject = step0.subject ?? ''
    const body = mergeTemplate(step0.body, {
      first_name: lead.first_name,
      company: lead.company,
    })

    await supabaseAdmin.from('cadence_send_queue').insert({
      enrollment_id: enroll.id,
      sequence_id: sequenceId,
      step_index: 0,
      to_email: lead.email,
      subject,
      body,
      scheduled_at: scheduledAt.toISOString(),
    })

    return NextResponse.json({ ok: true, enrollmentId: enroll.id })
  } catch (e: any) {
    console.error('Error in cadence/enroll:', e)
    return NextResponse.json({ error: e.message || 'Failed to enroll' }, { status: 500 })
  }
}

