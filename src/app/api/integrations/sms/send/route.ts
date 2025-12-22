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
    const { to, message } = body

    if (!to || !message) {
      return NextResponse.json({ error: 'Missing to or message' }, { status: 400 })
    }

    // Get Twilio integration
    const { data: twilioIntegration, error: integrationError } = await supabase
      .from('integration_accounts')
      .select('*')
      .eq('roofing_company_id', companyId)
      .eq('integration_type', 'twilio')
      .eq('is_active', true)
      .maybeSingle()

    if (integrationError || !twilioIntegration) {
      return NextResponse.json({ error: 'Twilio not connected' }, { status: 400 })
    }

    const accountSid = twilioIntegration.account_sid || twilioIntegration.api_key
    const authToken = twilioIntegration.api_secret
    const messagingServiceSid = twilioIntegration.config?.messaging_service_sid
    const from = twilioIntegration.config?.sender_id

    if (!accountSid || !authToken) {
      return NextResponse.json({ error: 'Twilio credentials missing' }, { status: 400 })
    }

    // Send SMS via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    
    const formData = new URLSearchParams()
    formData.append('To', to)
    formData.append('Body', message)
    
    if (messagingServiceSid) {
      formData.append('MessagingServiceSid', messagingServiceSid)
    } else if (from) {
      formData.append('From', from)
    } else {
      return NextResponse.json({ error: 'No sender configured' }, { status: 400 })
    }

    const res = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    if (!res.ok) {
      const error = await res.text()
      console.error('Twilio API error:', error)
      return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 })
    }

    const data = await res.json()
    return NextResponse.json({ success: true, messageSid: data.sid })
  } catch (error: any) {
    console.error('Error sending SMS:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

























