import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { getCurrentOrg } from '@/lib/org'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({} as any))
  const category = (body.category || '').toString().trim()
  const message = (body.message || '').toString().slice(0, 5000).trim()
  const page_pathname = (body.page_pathname || '').toString().slice(0, 500)

  // Validate category
  const validCategories = ['ui', 'bug', 'feature', 'performance', 'other']
  if (!category || !validCategories.includes(category)) {
    return NextResponse.json({ error: 'Invalid category. Must be one of: ui, bug, feature, performance, other' }, { status: 400 })
  }

  // Validate message
  if (!message || message.length === 0) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  // Get current org_id
  const orgId = await getCurrentOrg()

  // Insert feedback
  const { error } = await supabase
    .from('feedback')
    .insert({
      user_id: user.id,
      org_id: orgId || null,
      category,
      message,
      page_pathname: page_pathname || null,
    })

  if (error) {
    console.error('Feedback insert error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

