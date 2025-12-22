'use server'

import { revalidatePath } from 'next/cache'
import { getServerSupabase, supabaseAdmin } from '@/lib/supabase/server'
import { stripe, getPriceIdFromPlanId } from '@/lib/billing/stripe'

function nowIso() {
  return new Date().toISOString()
}

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return !!(email && list.includes(email.toLowerCase()))
}

async function requireAdmin() {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    throw new Error('Admin access required')
  }
}

export async function recordCheckIn(formData: FormData) {
  const companyId = String(formData.get('company_id') || '').trim()
  const note = String(formData.get('note') || '').trim()
  if (!companyId) return

  const sb = supabaseAdmin()
  const { data: existing } = await sb
    .from('client_ops')
    .select('notes')
    .eq('company_id', companyId)
    .maybeSingle()

  const stamp = new Date().toLocaleString()
  const line = note ? `[${stamp}] CHECK-IN: ${note}` : `[${stamp}] CHECK-IN recorded`
  const nextNotes = [existing?.notes, line].filter(Boolean).join('\n')

  await sb
    .from('client_ops')
    .update({ last_checkin_at: nowIso(), notes: nextNotes })
    .eq('company_id', companyId)

  revalidatePath('/dashboard/admin/client-ops')
  revalidatePath(`/dashboard/admin/client-ops/${companyId}`)
}

export async function pauseAccount(formData: FormData) {
  const companyId = String(formData.get('company_id') || '').trim()
  const reason = String(formData.get('reason') || 'manual_admin_pause').trim()
  if (!companyId) return

  const sb = supabaseAdmin()
  await sb.rpc('pause_company_sending', {
    p_company_id: companyId,
    p_reason: reason,
    p_error: 'Paused by admin (client ops). Manual resume required.',
  })

  revalidatePath('/dashboard/admin/client-ops')
  revalidatePath(`/dashboard/admin/client-ops/${companyId}`)
}

export async function resumeAccount(formData: FormData) {
  const companyId = String(formData.get('company_id') || '').trim()
  if (!companyId) return

  const sb = supabaseAdmin()
  await sb.rpc('resume_company_sending', { p_company_id: companyId })

  revalidatePath('/dashboard/admin/client-ops')
  revalidatePath(`/dashboard/admin/client-ops/${companyId}`)
}

export async function setFounderFlag(formData: FormData) {
  const companyId = String(formData.get('company_id') || '').trim()
  const founder = String(formData.get('founder') || '').trim() === 'true'
  if (!companyId) return

  const sb = supabaseAdmin()
  await sb.from('client_ops').update({ founder }).eq('company_id', companyId)

  revalidatePath('/dashboard/admin/client-ops')
  revalidatePath(`/dashboard/admin/client-ops/${companyId}`)
}

/**
 * BLOCK 267200 — Generate a Stripe checkout link (Starter) for a roofing company.
 * The link is appended to client_ops.notes so it can be copied immediately.
 */
export async function createStarterCheckoutLink(formData: FormData) {
  await requireAdmin()

  const companyId = String(formData.get('company_id') || '').trim()
  if (!companyId) return

  const sb = supabaseAdmin()

  const [{ data: company }, { data: existingSub }, { data: ops }] = await Promise.all([
    sb
      .from('roofing_companies')
      .select('id, name, owner_id')
      .eq('id', companyId)
      .maybeSingle(),
    sb
      .from('company_subscriptions')
      .select('stripe_customer_id')
      .eq('company_id', companyId)
      .maybeSingle(),
    sb.from('client_ops').select('notes').eq('company_id', companyId).maybeSingle(),
  ])

  if (!company) return

  const priceId = getPriceIdFromPlanId('starter')
  if (!priceId) {
    throw new Error('Stripe price not configured for Starter (STRIPE_PRICE_STARTER_ID)')
  }

  let customerId = existingSub?.stripe_customer_id || null
  if (!customerId) {
    let ownerEmail: string | undefined
    try {
      const res = await sb.auth.admin.getUserById(company.owner_id)
      ownerEmail = res.data.user?.email ?? undefined
    } catch {
      ownerEmail = undefined
    }

    const customer = await stripe.customers.create({
      email: ownerEmail,
      name: company.name || 'SmartSend Roofing Company',
      metadata: {
        company_id: companyId,
        owner_user_id: company.owner_id,
        block: '267200',
      },
    })
    customerId = customer.id

    await sb
      .from('company_subscriptions')
      .upsert(
        {
          company_id: companyId,
          stripe_customer_id: customerId,
          plan: 'starter',
          status: 'trial',
          started_at: nowIso(),
        },
        { onConflict: 'company_id' }
      )
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/dashboard/admin/client-ops/${companyId}?payment=success`,
    cancel_url: `${baseUrl}/dashboard/admin/client-ops/${companyId}?payment=canceled`,
    metadata: {
      company_id: companyId,
      plan: 'starter',
      block: '267200',
    },
    subscription_data: {
      metadata: {
        company_id: companyId,
        plan: 'starter',
        block: '267200',
      },
    },
  })

  const stamp = new Date().toLocaleString()
  const line = `[${stamp}] STRIPE_CHECKOUT_STARTER: ${session.url}`
  const nextNotes = [ops?.notes, line].filter(Boolean).join('\n')

  await sb.from('client_ops').update({ notes: nextNotes }).eq('company_id', companyId)

  revalidatePath('/dashboard/admin/client-ops')
  revalidatePath(`/dashboard/admin/client-ops/${companyId}`)
}

/**
 * BLOCK 267200 — Manual override: mark the company as paid and unlock sending.
 * This is an emergency tool; primary path should be Stripe webhook.
 */
export async function markCompanyPaid(formData: FormData) {
  await requireAdmin()

  const companyId = String(formData.get('company_id') || '').trim()
  if (!companyId) return

  const sb = supabaseAdmin()
  const { data: company } = await sb
    .from('roofing_companies')
    .select('id, owner_id')
    .eq('id', companyId)
    .maybeSingle()

  await sb
    .from('company_subscriptions')
    .upsert(
      {
        company_id: companyId,
        plan: 'starter',
        status: 'active',
        renewed_at: nowIso(),
      },
      { onConflict: 'company_id' }
    )

  if (company?.owner_id) {
    // Unlock SmartSend sending by marking the owner profile as paid
    await sb
      .from('profiles')
      .update({
        subscription_status: 'active',
        plan_nickname: 'starter',
        current_period_end: null,
      })
      .eq('id', company.owner_id)
  }

  revalidatePath('/dashboard/admin/client-ops')
  revalidatePath(`/dashboard/admin/client-ops/${companyId}`)
}

export async function markCompanyUnpaid(formData: FormData) {
  await requireAdmin()

  const companyId = String(formData.get('company_id') || '').trim()
  if (!companyId) return

  const sb = supabaseAdmin()
  const { data: company } = await sb
    .from('roofing_companies')
    .select('id, owner_id')
    .eq('id', companyId)
    .maybeSingle()

  await sb
    .from('company_subscriptions')
    .upsert(
      {
        company_id: companyId,
        plan: 'starter',
        status: 'trial',
      },
      { onConflict: 'company_id' }
    )

  if (company?.owner_id) {
    await sb
      .from('profiles')
      .update({
        subscription_status: null,
        plan_nickname: null,
        price_id: null,
        stripe_subscription_id: null,
        current_period_end: null,
      })
      .eq('id', company.owner_id)
  }

  revalidatePath('/dashboard/admin/client-ops')
  revalidatePath(`/dashboard/admin/client-ops/${companyId}`)
}









