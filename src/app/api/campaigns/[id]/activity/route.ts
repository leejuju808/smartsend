import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const campaignId = params.id
  const limit = Number(new URL(req.url).searchParams.get("limit") || 50)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, created_at, actor_id, action, entity, entity_id, meta")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ items: data || [] })
}

