// app/api/enrichment/enqueue/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { campaignId, leadIds } = await req.json() as { campaignId?: string, leadIds?: string[] }

  let leads: { id: string }[] = []
  
  if (Array.isArray(leadIds) && leadIds.length) {
    const { data } = await supabase
      .from('leads')
      .select('id,campaign_id')
      .in('id', leadIds)
    leads = data || []
  } else if (campaignId) {
    const { data } = await supabase
      .from('leads')
      .select('id')
      .eq('campaign_id', campaignId)
      .in('enrichment_status',['none','error'])
    leads = data || []
  } else {
    return NextResponse.json({ error: 'no targets' }, { status: 400 })
  }

  // get org from campaign (if any)
  let orgId: string | null = null
  if (campaignId) {
    const { data: camp } = await supabase
      .from('campaigns')
      .select('org_id')
      .eq('id', campaignId)
      .maybeSingle()
    orgId = camp?.org_id ?? null
  }

  // Use service role client for RPC call
  const { createClient } = await import('@supabase/supabase-js')
  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  for (const l of leads) {
    await serviceSupabase.rpc('enqueue_enrichment', { 
      p_user: user.id, 
      p_org: orgId, 
      p_campaign: campaignId || null, 
      p_lead: l.id, 
      p_priority: 5 
    })
  }

  return NextResponse.json({ queued: leads.length })
}






