import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const meetingId = params.id

    // Get meeting invite with access control
    const { data: meeting, error: meetingError } = await supabase
      .from('meeting_invites')
      .select(`
        *,
        campaign_contacts!inner(
          campaigns!inner(owner)
        )
      `)
      .eq('id', meetingId)
      .eq('campaign_contacts.campaigns.owner', user.id)
      .single()

    if (meetingError || !meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    // Create ICS file response
    const icsContent = meeting.ics_data
    const filename = `meeting-${meeting.summary.replace(/[^a-zA-Z0-9]/g, '-')}.ics`

    return new NextResponse(icsContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      }
    })

  } catch (error) {
    console.error('Error downloading ICS:', error)
    return NextResponse.json(
      { error: 'Failed to download ICS file' },
      { status: 500 }
    )
  }
} 