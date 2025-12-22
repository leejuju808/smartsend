import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { campaign_id } = body

    if (!campaign_id) {
      return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })
    }

    // Verify user is authenticated
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set() {},
          remove() {},
        },
      }
    )

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user has access to this campaign
    const { data: campaign, error: campError } = await supabase
      .from('campaigns')
      .select('user_id')
      .eq('id', campaign_id)
      .single()

    if (campError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.user_id !== user.id) {
      // Check if user is part of a team that has access (if team-based)
      // For now, just check direct ownership
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Call the edge function
    const edgeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/build_queue`
    const edgeResponse = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ campaign_id }),
    })

    if (!edgeResponse.ok) {
      const errorText = await edgeResponse.text()
      return NextResponse.json(
        { error: errorText || 'Failed to build queue' },
        { status: edgeResponse.status }
      )
    }

    const result = await edgeResponse.json()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('Error launching campaign:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

