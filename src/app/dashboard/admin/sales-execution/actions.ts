import 'server-only'

import { revalidatePath } from 'next/cache'
import { getServerSupabase, supabaseAdmin } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/audit-log'

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return !!(email && list.includes(email.toLowerCase()))
}

async function requireAdmin() {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) {
    throw new Error('Not authorized')
  }
  return user
}

function clean(v: FormDataEntryValue | null): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length ? s : null
}

export async function createSalesLead(formData: FormData) {
  await requireAdmin()
  const sb = supabaseAdmin()

  const company_name = clean(formData.get('company_name'))
  if (!company_name) throw new Error('company_name is required')

  const owner_name = clean(formData.get('owner_name'))
  const email = clean(formData.get('email'))?.toLowerCase() ?? null
  const phone = clean(formData.get('phone'))
  const city = clean(formData.get('city'))
  const state = clean(formData.get('state'))
  const source = (clean(formData.get('source')) || 'cold_email') as 'cold_email' | 'referral' | 'inbound'
  const notes = clean(formData.get('notes'))

  const { error } = await sb.from('sales_leads').insert({
    company_name,
    owner_name,
    email,
    phone,
    city,
    state,
    source,
    status: 'prospect',
    notes,
  })

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/admin/sales-execution')
}

export async function bookDemo(formData: FormData) {
  const user = await requireAdmin()
  const sb = supabaseAdmin()

  const id = clean(formData.get('id'))
  if (!id) throw new Error('Missing lead id')

  const now = new Date().toISOString()
  const { data: lead, error: getErr } = await sb
    .from('sales_leads')
    .select('id, status, notes')
    .eq('id', id)
    .maybeSingle()

  if (getErr) throw new Error(getErr.message)
  if (!lead) throw new Error('Lead not found')

  const nextNotes = [
    lead.notes || null,
    `[${now}] Demo booked. Calendar placeholder created (no integration).`,
  ].filter(Boolean).join('\n')

  const { error } = await sb
    .from('sales_leads')
    .update({ status: 'demo_booked', notes: nextNotes })
    .eq('id', id)

  if (error) throw new Error(error.message)

  // Best-effort audit event (never blocks primary flow)
  await logAuditEvent({
    lead_id: id,
    event_type: 'sales_demo_booked',
    actor_type: 'user',
    actor_id: user.id,
    event_data: { table: 'sales_leads' },
  })

  revalidatePath('/dashboard/admin/sales-execution')
}

export async function startTrial(formData: FormData) {
  const user = await requireAdmin()
  const sb = supabaseAdmin()

  const id = clean(formData.get('id'))
  if (!id) throw new Error('Missing lead id')

  const now = new Date()
  const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const { data: lead, error: leadErr } = await sb
    .from('sales_leads')
    .select('id, company_name, email, status, notes')
    .eq('id', id)
    .maybeSingle()

  if (leadErr) throw new Error(leadErr.message)
  if (!lead) throw new Error('Lead not found')
  if (!lead.email) throw new Error('Lead has no email; cannot start trial')

  // Provision: if the user already exists, create a workspace for them and start trial clock on their profile.
  const { data: profile, error: profErr } = await sb
    .from('profiles')
    .select('id, email')
    .eq('email', lead.email.toLowerCase())
    .maybeSingle()

  if (profErr) throw new Error(profErr.message)
  if (!profile?.id) {
    throw new Error(`No user account found for ${lead.email}. Have them sign up first, then retry Start Trial.`)
  }

  // Create a workspace for the new customer (best-effort; skip if they already have one).
  const { data: existingWs } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', profile.id)
    .limit(1)

  let workspaceId: string | null = existingWs?.[0]?.workspace_id ?? null

  if (!workspaceId) {
    const { data: ws, error: wsErr } = await sb
      .from('workspaces')
      .insert({ name: lead.company_name, created_by: profile.id })
      .select('id')
      .single()
    if (wsErr) throw new Error(wsErr.message)
    workspaceId = ws.id

    const { error: memErr } = await sb
      .from('workspace_members')
      .insert({ workspace_id: workspaceId, user_id: profile.id, role: 'owner' })
    if (memErr) throw new Error(memErr.message)
  }

  // Start trial clock + force onboarding visible (first_login=true).
  const { error: trialErr } = await sb
    .from('profiles')
    .update({
      subscription_status: 'trialing',
      trial_started_at: now.toISOString(),
      trial_ends_at: ends.toISOString(),
      first_login: true,
      updated_at: now.toISOString(),
    })
    .eq('id', profile.id)

  if (trialErr) throw new Error(trialErr.message)

  const nextNotes = [
    lead.notes || null,
    `[${now.toISOString()}] Trial started. workspace_id=${workspaceId}. demo_mode=false.`,
  ].filter(Boolean).join('\n')

  const { error: upErr } = await sb
    .from('sales_leads')
    .update({ status: 'trial', notes: nextNotes })
    .eq('id', id)
  if (upErr) throw new Error(upErr.message)

  await logAuditEvent({
    lead_id: id,
    event_type: 'sales_trial_started',
    actor_type: 'user',
    actor_id: user.id,
    event_data: { table: 'sales_leads', workspace_id: workspaceId },
  })

  revalidatePath('/dashboard/admin/sales-execution')
}









