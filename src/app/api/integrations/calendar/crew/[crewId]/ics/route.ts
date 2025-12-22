import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * ICS feed for crew calendars
 * Public endpoint (with secret token) that crews can subscribe to on iPhone/Android
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { crewId: string } }
) {
  try {
    const { searchParams } = new URL(req.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 401 })
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          get: () => undefined,
          set: () => {},
          remove: () => {},
        },
      }
    )

    // Find calendar events for this crew with matching token
    const { data: events, error: eventsError } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('crew_id', params.crewId)
      .eq('ics_feed_token', token)
      .gte('start_time', new Date().toISOString()) // Only future events
      .order('start_time', { ascending: true })

    if (eventsError || !events) {
      return NextResponse.json({ error: 'Invalid token or no events' }, { status: 404 })
    }

    // Generate ICS file
    const icsContent = generateICS(events)

    return new NextResponse(icsContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="crew-${params.crewId}.ics"`,
      },
    })
  } catch (error: any) {
    console.error('Error generating ICS feed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function generateICS(events: any[]): string {
  const lines: string[] = []
  lines.push('BEGIN:VCALENDAR')
  lines.push('VERSION:2.0')
  lines.push('PRODID:-//SmartSend//Crew Calendar//EN')
  lines.push('CALSCALE:GREGORIAN')
  lines.push('METHOD:PUBLISH')

  for (const event of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${event.id}@smartsend.ai`)
    lines.push(`DTSTAMP:${formatICSDate(new Date())}`)
    lines.push(`DTSTART:${formatICSDate(new Date(event.start_time))}`)
    if (event.end_time) {
      lines.push(`DTEND:${formatICSDate(new Date(event.end_time))}`)
    }
    lines.push(`SUMMARY:${escapeICS(event.title)}`)
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeICS(event.description)}`)
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeICS(event.location)}`)
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

























