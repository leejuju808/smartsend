import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { scoreStep } from '@/lib/sequences/scoring'

export async function PATCH(req: Request, { params }: { params: { stepId: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await req.json() as {
    subject_template?: string
    body_md?: string
    subject?: string  // alias for subject_template
    body?: string      // alias for body_md
  }

  // Normalize field names
  const subject_template = payload.subject_template || payload.subject || ''
  const body_md = payload.body_md || payload.body || ''

  // Get step info to find campaign_id
  const { data: step } = await supabase
    .from('sequence_steps')
    .select('id, sequence_id')
    .eq('id', params.stepId)
    .single()

  if (!step) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Get campaign_id from sequence
  const { data: sequence } = await supabase
    .from('sequences')
    .select('campaign_id')
    .eq('id', step.sequence_id)
    .single()

  if (!sequence) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
  if (!sequence.campaign_id) return NextResponse.json({ error: 'Sequence not linked to campaign' }, { status: 400 })

  // enforce collaborator permissions
  const { requireEditor } = await import('@/lib/permissions/campaign')
  const check = await requireEditor(sequence.campaign_id)
  if (!check.allowed) return check.response

  // Calculate score
  const scoreResult = scoreStep(subject_template, body_md)

  // Update step
  const updateData: any = {}
  if (subject_template !== undefined) updateData.subject_template = subject_template
  if (body_md !== undefined) updateData.body_md = body_md
  updateData.ai_score = scoreResult.score
  updateData.ai_notes = scoreResult.notes
  updateData.last_optimized_at = new Date().toISOString()

  const { data: updated, error } = await supabase
    .from('sequence_steps')
    .update(updateData)
    .eq('id', params.stepId)
    .select('id, step_number, subject_template, body_md, ai_score, ai_notes, last_optimized_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log version snapshot
  const { logSequenceVersion } = await import('@/lib/sequences/version-logger')
  await logSequenceVersion(step.sequence_id, sequence.campaign_id, user.id, 'update_step')

  return NextResponse.json({ ok: true, step: updated, score: scoreResult })
}

