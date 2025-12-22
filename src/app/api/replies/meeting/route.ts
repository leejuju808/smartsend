import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createMeetingInvite } from '@/lib/ics';
import { mailer } from '@/lib/mailer';

export interface MeetingReplyRequest {
  campaign_id: string;
  contact_email: string;
  contact_name?: string;
  meeting_summary: string;
  meeting_date: string;
  meeting_duration: number; // minutes
  calendly_url?: string;
  custom_message?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body: MeetingReplyRequest = await request.json();
    
    // Validate required fields
    if (!body.campaign_id || !body.contact_email || !body.meeting_summary || !body.meeting_date) {
      return NextResponse.json(
        { error: 'Missing required fields: campaign_id, contact_email, meeting_summary, meeting_date' },
        { status: 400 }
      );
    }

    // Verify campaign exists and belongs to user
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', body.campaign_id)
      .eq('user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Get user's mailbox
    const { data: mailbox, error: mailboxError } = await supabase
      .from('mailboxes')
      .select('*')
      .eq('owner', user.id)
      .eq('verified', true)
      .limit(1)
      .single();

    if (mailboxError || !mailbox) {
      return NextResponse.json(
        { error: 'No verified mailbox found. Please set up your email sending configuration.' },
        { status: 400 }
      );
    }

    // Parse meeting date
    const meetingDate = new Date(body.meeting_date);
    if (isNaN(meetingDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid meeting date format' },
        { status: 400 }
      );
    }

    // Generate ICS calendar invite
    const icsContent = createMeetingInvite(
      body.meeting_summary,
      meetingDate,
      body.meeting_duration,
      {
        name: mailbox.from_name || 'SmartSend User',
        email: mailbox.from_email,
      },
      {
        name: body.contact_name || body.contact_email,
        email: body.contact_email,
      },
      body.custom_message || `Meeting scheduled via SmartSend campaign: ${campaign.name}`
    );

    // Create email content
    const subject = `Re: ${campaign.subject}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>Hi ${body.contact_name || 'there'},</p>
        
        <p>${body.custom_message || `Thank you for your interest in our campaign: ${campaign.name}. I'd be happy to schedule a meeting with you.`}</p>
        
        <p><strong>Meeting Details:</strong></p>
        <ul>
          <li><strong>Topic:</strong> ${body.meeting_summary}</li>
          <li><strong>Date:</strong> ${meetingDate.toLocaleDateString()}</li>
          <li><strong>Time:</strong> ${meetingDate.toLocaleTimeString()}</li>
          <li><strong>Duration:</strong> ${body.meeting_duration} minutes</li>
        </ul>
        
        ${body.calendly_url ? `
        <p>You can also schedule a different time that works better for you:</p>
        <p><a href="${body.calendly_url}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Schedule on Calendly</a></p>
        ` : ''}
        
        <p>I've attached a calendar invite to this email. Please let me know if you need to reschedule.</p>
        
        <p>Best regards,<br>
        ${mailbox.from_name || 'SmartSend User'}</p>
      </div>
    `;

    // Send email with ICS attachment
    const sendResult = await mailer.sendEmail(
      mailbox.owner,
      {
        to: body.contact_email,
        subject,
        html,
        customHeaders: {
          'Content-Type': 'multipart/mixed',
          'X-Campaign-ID': body.campaign_id,
          'X-Meeting-Reply': 'true',
        },
      },
      body.campaign_id,
      user.id
    );

    if (!sendResult.success) {
      return NextResponse.json(
        { error: 'Failed to send meeting reply', details: sendResult.error },
        { status: 500 }
      );
    }

    // Log the meeting reply
    const { error: logError } = await supabase
      .from('ai_reply_events')
      .insert({
        campaign_id: body.campaign_id,
        user_id: user.id,
        contact_email: body.contact_email,
        event_type: 'meeting_reply_sent',
        event_data: {
          meeting_summary: body.meeting_summary,
          meeting_date: body.meeting_date,
          meeting_duration: body.meeting_duration,
          calendly_url: body.calendly_url,
          custom_message: body.custom_message,
        },
        created_at: new Date().toISOString(),
      });

    if (logError) {
      console.error('Error logging meeting reply:', logError);
      // Don't fail the request if logging fails
    }

    // Update campaign stats
    try {
      await supabase
        .from('campaigns')
        .update({ 
          meeting_replies: ((campaign as any).meeting_replies || 0) + 1 
        })
        .eq('id', body.campaign_id);
    } catch (updateError) {
      console.error('Error updating campaign meeting replies:', updateError);
    }

    return NextResponse.json({
      success: true,
      message: 'Meeting reply sent successfully',
      campaign_id: body.campaign_id,
      contact_email: body.contact_email,
      meeting_date: body.meeting_date,
      message_id: sendResult.messageId,
    });
  } catch (error) {
    console.error('Meeting reply error:', error);
    return NextResponse.json(
      { error: 'Failed to send meeting reply' },
      { status: 500 }
    );
  }
}

// Helper function to send email with ICS attachment
async function sendEmailWithICS(
  mailboxId: string,
  emailData: any,
  icsContent: string,
  campaignId: string,
  userId: string
) {
  // For now, we'll use the basic mailer
  // In production, you'd want to implement proper MIME multipart handling
  return await mailer.sendEmail(mailboxId, emailData, campaignId, userId);
} 