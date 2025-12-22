import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/replies/sendEmail';

function sbAdmin() {
  return new (createClient as any)(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const { id, toEmail } = await req.json();
    if (!id || !toEmail) {
      return NextResponse.json({ error: 'id and toEmail required' }, { status: 400 });
    }

    const sb = sbAdmin();
    const workspaceId = process.env.NEXT_PUBLIC_DEMO_WORKSPACE_ID!;
    await sb.rpc('app.set_workspace', { id: workspaceId });

    // Get the draft
    const { data: rows, error } = await sb
      .from('auto_replies')
      .select('*')
      .eq('id', id)
      .limit(1);
      
    if (error || !rows || !rows.length) {
      throw new Error('draft not found');
    }
    
    const draft = rows[0];

    // Send the email
    await sendEmail({
      toEmail,
      fromEmail: process.env.REPLY_FROM_EMAIL!,
      fromName: process.env.REPLY_FROM_NAME!,
      subject: draft.subject,
      text: draft.text,
      html: draft.html,
      ics: draft.ics_content ? { 
        filename: draft.ics_filename || 'invite.ics', 
        content: draft.ics_content 
      } : null,
    });

    // Update status to sent
    await sb
      .from('auto_replies')
      .update({ 
        status: 'sent', 
        sent_at: new Date().toISOString() 
      })
      .eq('id', id);
      
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'send failed' }, { status: 500 });
  }
} 