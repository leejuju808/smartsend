import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { ReplyIntentDetector, type ReplyIntent, type ICSInvite } from '@/lib/reply-intent-detector'

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { replyText, contactId, campaignId, contactName, contactEmail } = body

    // Validate input
    if (!replyText || !contactId || !contactName || !contactEmail) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Detect intent using our ruleset
    const intent: ReplyIntent = ReplyIntentDetector.detectIntent(replyText)

    // Get user's profile for organizer details
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Generate ICS invite if high confidence
    let icsData: string | null = null
    let meetingInvite: ICSInvite | null = null

    if (intent.responseType === 'immediate_ics') {
      meetingInvite = ReplyIntentDetector.generateDefaultInvite(
        contactName,
        contactEmail,
        profile.full_name || user.email || 'SmartSend User',
        profile.email || user.email || '',
        intent.suggestedTime,
        intent.suggestedDate
      )
      
      icsData = ReplyIntentDetector.generateICS(meetingInvite)
    }

    // Save reply with intent analysis
    const { data: replyData, error: replyError } = await supabase
      .from('email_replies')
      .insert({
        campaign_contact_id: contactId,
        from_email: contactEmail,
        subject: 'Reply to campaign',
        body: replyText,
        // Add intent analysis fields
        intent_analysis: intent,
        meeting_booked: intent.responseType === 'immediate_ics',
        ics_generated: intent.responseType === 'immediate_ics'
      })
      .select()
      .single()

    if (replyError) {
      console.error('Error saving reply:', replyError)
      return NextResponse.json({ error: 'Failed to save reply' }, { status: 500 })
    }

    // If ICS was generated, save it
    if (icsData && meetingInvite) {
      const { error: icsError } = await supabase
        .from('meeting_invites')
        .insert({
          reply_id: replyData.id,
          contact_id: contactId,
          ics_data: icsData,
          summary: meetingInvite.summary,
          start_time: meetingInvite.startTime.toISOString(),
          end_time: meetingInvite.endTime.toISOString(),
          organizer_name: meetingInvite.organizer.name,
          organizer_email: meetingInvite.organizer.email,
          attendee_name: meetingInvite.attendee.name,
          attendee_email: meetingInvite.attendee.email
        })

      if (icsError) {
        console.error('Error saving ICS invite:', icsError)
        // Don't fail the request if ICS save fails
      }
    }

    // Update campaign contact with reply status
    await supabase
      .from('campaign_contacts')
      .update({
        last_reply_at: new Date().toISOString(),
        reply_count: supabase.rpc('increment', { table_name: 'campaign_contacts', column_name: 'reply_count', row_id: contactId })
      })
      .eq('id', contactId)

    return NextResponse.json({
      intent,
      icsData,
      meetingInvite,
      replyId: replyData.id,
      message: intent.responseType === 'immediate_ics' 
        ? 'Meeting intent detected! ICS invite generated and sent.'
        : intent.responseType === 'human_review'
        ? 'Potential meeting intent detected. Review recommended.'
        : 'No meeting intent detected.'
    })

  } catch (error) {
    console.error('Error processing reply intent:', error)
    return NextResponse.json(
      { error: 'Failed to process reply intent' },
      { status: 500 }
    )
  }
} 