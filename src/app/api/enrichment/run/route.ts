// app/api/enrichment/run/route.ts
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  const enrichFunctionUrl = process.env.ENRICH_FUNCTION_URL || 
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/enrich-leads`
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(enrichFunctionUrl, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${cronSecret}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({})
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: text }, { status: res.status })
    }

    return new Response('ok')
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

