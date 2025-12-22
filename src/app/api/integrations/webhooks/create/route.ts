import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getCurrentCompanyId } from '@/lib/company-helpers'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name: string) => cookieStore.get(name)?.value,
          set: () => {},
          remove: () => {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyId = await getCurrentCompanyId()
    if (!companyId) {
      return NextResponse.json({ error: 'No company found' }, { status: 400 })
    }

    const body = await req.json()
    const { name, url, event_types, payload_template, method } = body

    if (!name || !url || !event_types || !Array.isArray(event_types) || event_types.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Generate webhook secret
    const secret = crypto.randomBytes(32).toString('hex')

    const { data: webhook, error: insertError } = await supabase
      .from('webhooks_outgoing')
      .insert({
        roofing_company_id: companyId,
        name,
        url,
        secret,
        event_types,
        payload_template: payload_template || {},
        method: method || 'POST',
        is_active: true,
        created_by_user_id: user.id,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating webhook:', insertError)
      return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 })
    }

    return NextResponse.json({ success: true, webhook })
  } catch (error: any) {
    console.error('Error creating webhook:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

























