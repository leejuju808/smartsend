import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendMeetingConfirmation } from '@/lib/mailer';
import { Meeting } from '@/types/meetings';

function okAuth(req: Request) {
  const url = new URL(req.url);
  const bearer = req.headers.get('authorization') || '';
  const qSecret = url.searchParams.get('secret') || '';
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  const secret = process.env.INTERNAL_WEBHOOK_SECRET || '';
  return (!!secret && (token === secret || qSecret === secret));
}

export async function POST(req: Request) {
  if (!okAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const body = await req.json().catch(() => ({}));
    const { meetingId } = body || {};
    
    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('meetings')
      .update({ 
        status: 'booked', 
        booked_at: new Date().toISOString() 
      })
      .eq('id', meetingId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const meeting = data as Meeting;

    // Fire confirmation email
    if (meeting.contact_email && meeting.ics) {
      const replyText = `Hi ${meeting.contact_email.split('@')[0]},\n\nYour meeting is confirmed!\n\nWhen: ${new Date(meeting.start_at).toLocaleString()}\nWhere: ${meeting.location || 'Video'}\n\nSee you soon.\n\n— SmartSend AI`;
      
      await sendMeetingConfirmation({
        to: meeting.contact_email,
        subject: `Meeting confirmed: ${meeting.subject || 'Intro Call'}`,
        text: replyText,
        ics: { filename: 'invite.ics', content: meeting.ics },
      });
    }

    return NextResponse.json({ ok: true, meeting });
  } catch (e: any) {
    return NextResponse.json({ 
      error: 'Handler crashed', 
      details: String(e?.message || e) 
    }, { status: 500 });
  }
} 