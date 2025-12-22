import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { status } = await req.json() as { status: string }
    
    if (!status || !['active', 'paused', 'completed', 'cancelled'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseAdmin = (await import('@/lib/supabase/server')).createServiceClient()

    // Verify ownership
    const { data: enrollment } = await supabaseAdmin
      .from('cadence_enrollments')
      .select('sequence_id')
      .eq('id', params.id)
      .single()

    if (!enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
    }

    const { data: sequence } = await supabaseAdmin
      .from('cadence_sequences')
      .select('owner_user_id')
      .eq('id', enrollment.sequence_id)
      .single()

    if (!sequence || sequence.owner_user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await supabaseAdmin
      .from('cadence_enrollments')
      .update({ status })
      .eq('id', params.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('Error in cadence/enrollment:', e)
    return NextResponse.json({ error: e.message || 'Failed to update enrollment' }, { status: 500 })
  }
}

