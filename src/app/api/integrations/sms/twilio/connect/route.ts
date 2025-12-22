import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getCurrentCompanyId } from '@/lib/company-helpers'

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
    const { account_sid, auth_token, messaging_service_sid, sender_id } = body

    if (!account_sid || !auth_token) {
      return NextResponse.json({ error: 'Missing account_sid or auth_token' }, { status: 400 })
    }

    // Test Twilio connection
    const testRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account_sid}.json`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${account_sid}:${auth_token}`).toString('base64')}`,
      },
    })

    if (!testRes.ok) {
      return NextResponse.json({ error: 'Invalid Twilio credentials' }, { status: 400 })
    }

    // Store integration
    const { error: insertError } = await supabase
      .from('integration_accounts')
      .upsert({
        roofing_company_id: companyId,
        integration_type: 'twilio',
        account_sid,
        api_key: account_sid, // Store in api_key field
        api_secret: auth_token, // Store in api_secret field
        is_active: true,
        connected_by_user_id: user.id,
        connected_at: new Date().toISOString(),
        config: {
          messaging_service_sid: messaging_service_sid || null,
          sender_id: sender_id || null,
        },
      }, {
        onConflict: 'roofing_company_id,integration_type',
      })

    if (insertError) {
      console.error('Error storing Twilio integration:', insertError)
      return NextResponse.json({ error: 'Failed to store integration' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error connecting Twilio:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

























