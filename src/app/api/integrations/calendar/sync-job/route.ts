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
    const { job_id, title, description, start_time, end_time, location, attendees } = body

    if (!job_id || !title || !start_time) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get active calendar integration
    const { data: calendarIntegration } = await supabase
      .from('integration_accounts')
      .select('*')
      .eq('roofing_company_id', companyId)
      .in('integration_type', ['google_calendar', 'outlook_calendar'])
      .eq('is_active', true)
      .maybeSingle()

    if (!calendarIntegration) {
      return NextResponse.json({ error: 'No calendar integration found' }, { status: 400 })
    }

    // Create calendar event
    let externalEventId: string | null = null

    if (calendarIntegration.integration_type === 'google_calendar') {
      externalEventId = await createGoogleCalendarEvent(calendarIntegration, {
        title,
        description,
        start_time,
        end_time,
        location,
        attendees,
      })
    } else if (calendarIntegration.integration_type === 'outlook_calendar') {
      externalEventId = await createOutlookCalendarEvent(calendarIntegration, {
        title,
        description,
        start_time,
        end_time,
        location,
        attendees,
      })
    }

    // Store in calendar_events table
    const { data: calendarEvent, error: insertError } = await supabase
      .from('calendar_events')
      .insert({
        roofing_company_id: companyId,
        source_type: 'job',
        source_id: job_id,
        title,
        description,
        start_time,
        end_time,
        location,
        attendees: attendees || [],
        external_calendar_id: externalEventId,
        external_calendar_type: calendarIntegration.integration_type === 'google_calendar' ? 'google' : 'outlook',
        integration_account_id: calendarIntegration.id,
        is_synced: true,
        last_synced_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error storing calendar event:', insertError)
      return NextResponse.json({ error: 'Failed to store calendar event' }, { status: 500 })
    }

    return NextResponse.json({ success: true, event: calendarEvent })
  } catch (error: any) {
    console.error('Error syncing job to calendar:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function createGoogleCalendarEvent(integration: any, event: any): Promise<string> {
  // Refresh token if needed
  let accessToken = integration.access_token
  if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
    // Refresh token logic here
    accessToken = await refreshGmailToken(integration.refresh_token)
  }

  const eventData = {
    summary: event.title,
    description: event.description || '',
    start: {
      dateTime: event.start_time,
      timeZone: 'America/New_York', // TODO: Get from company settings
    },
    end: {
      dateTime: event.end_time || event.start_time,
      timeZone: 'America/New_York',
    },
    location: event.location || '',
    attendees: (event.attendees || []).map((email: string) => ({ email })),
  }

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Google Calendar API error: ${error}`)
  }

  const data = await res.json()
  return data.id
}

async function createOutlookCalendarEvent(integration: any, event: any): Promise<string> {
  let accessToken = integration.access_token
  if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
    accessToken = await refreshOutlookToken(integration.refresh_token)
  }

  const eventData = {
    subject: event.title,
    body: {
      contentType: 'HTML',
      content: event.description || '',
    },
    start: {
      dateTime: event.start_time,
      timeZone: 'Eastern Standard Time',
    },
    end: {
      dateTime: event.end_time || event.start_time,
      timeZone: 'Eastern Standard Time',
    },
    location: {
      displayName: event.location || '',
    },
    attendees: (event.attendees || []).map((email: string) => ({
      emailAddress: { address: email },
      type: 'required',
    })),
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/calendar/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Outlook Calendar API error: ${error}`)
  }

  const data = await res.json()
  return data.id
}

async function refreshGmailToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) throw new Error('Failed to refresh token')
  const data = await res.json()
  return data.access_token
}

async function refreshOutlookToken(refreshToken: string): Promise<string> {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Calendars.ReadWrite',
    }),
  })

  if (!res.ok) throw new Error('Failed to refresh token')
  const data = await res.json()
  return data.access_token
}

























