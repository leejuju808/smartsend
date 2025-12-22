// app/api/templates/route.ts  (list/create)
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const type = url.searchParams.get('type')
  
  // If type=campaign, use new templates table for campaign steps
  if (type === 'campaign') {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ templates: data || [] })
  }

  // Legacy reply_templates support
  const scope = (url.searchParams.get('scope') as 'user'|'org') || 'user'
  let ownerId = url.searchParams.get('ownerId')

  // Resolve ownerId for org scope
  if (scope === 'org') {
    if (!ownerId || ownerId === 'me') {
      // Try to get current org from /api/orgs/list
      try {
        const orgRes = await fetch(`${url.origin}/api/orgs/list`)
        if (orgRes.ok) {
          const orgData = await orgRes.json()
          ownerId = orgData.currentOrgId || orgData.current || orgData.orgs?.[0]?.id || null
        }
      } catch (e) {
        // Fallback: query org_members directly
        const { data: member } = await supabase
          .from('org_members')
          .select('org_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()
        ownerId = member?.org_id || null
      }
    }
  } else {
    // For user scope, always use current user
    ownerId = user.id
  }

  if (!ownerId) {
    return NextResponse.json({ templates: [] })
  }

  const { data, error } = await supabase
    .from('reply_templates')
    .select('*')
    .eq('owner_scope', scope)
    .eq('owner_id', ownerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ templates: data || [] })
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = await req.json()
  const { error } = await supabase.from('reply_templates').insert(b)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
