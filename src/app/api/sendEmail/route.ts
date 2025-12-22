import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { sendEmail } from '@/lib/email/sendEmail';
import { getCurrentWorkspaceIdFromCookie } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, subject, body, lead_id } = await req.json();

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, body' },
        { status: 400 }
      );
    }

    // Get workspace_id from cookie or user's first workspace
    const workspace_id = await getCurrentWorkspaceIdFromCookie();
    
    if (!workspace_id) {
      // Fallback: get user's first workspace
      const { data: workspaceMember } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      
      if (!workspaceMember?.workspace_id) {
        return NextResponse.json(
          { error: 'No workspace found' },
          { status: 400 }
        );
      }
      
      const finalWorkspaceId = workspaceMember.workspace_id;
      
      // Get sender email from workspace's mailbox or user's email
      const { data: mailbox } = await supabase
        .from('mailboxes')
        .select('from_email')
        .eq('workspace_id', finalWorkspaceId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      
      const fromEmail = mailbox?.from_email || user.email;
      
      if (!fromEmail) {
        return NextResponse.json(
          { error: 'No sender email found' },
          { status: 400 }
        );
      }

      // Convert plain text to HTML for email body
      const htmlBody = body.replace(/\n/g, '<br>');

      // Send email
      await sendEmail({
        to,
        from: fromEmail,
        subject,
        body: htmlBody,
        workspace_id: finalWorkspaceId,
        campaign_id: lead_id ? undefined : undefined, // Can derive campaign from lead if needed
      });
      
      return NextResponse.json({ ok: true, message: 'Reply sent successfully' });
    }

    // Get sender email from workspace's mailbox
    const { data: mailbox } = await supabase
      .from('mailboxes')
      .select('from_email')
      .eq('workspace_id', workspace_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const fromEmail = mailbox?.from_email || user.email;

    if (!fromEmail) {
      return NextResponse.json(
        { error: 'No sender email found' },
        { status: 400 }
      );
    }

    // Convert plain text to HTML for email body
    const htmlBody = body.replace(/\n/g, '<br>');

    // Send email using the sendEmail function
    await sendEmail({
      to,
      from: fromEmail,
      subject,
      body: htmlBody,
      workspace_id,
      campaign_id: lead_id ? undefined : undefined,
    });

    return NextResponse.json({ ok: true, message: 'Reply sent successfully' });
  } catch (e: any) {
    console.error('Error sending email:', e);
    return NextResponse.json(
      { error: e?.message || 'Failed to send email' },
      { status: 500 }
    );
  }
}

