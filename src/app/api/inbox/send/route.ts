import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import nodemailer from "nodemailer";

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { threadId, to, subject, bodyText } = body as { threadId: string; to: string; subject: string; bodyText: string };
    if (!threadId || !to || !subject || !bodyText) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Get thread and workspace
    const { data: t } = await supabaseAdmin
      .from('inbox_threads')
      .select('id, workspace_id')
      .eq('id', threadId)
      .maybeSingle()
    if (!t) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

    // Load sending mailbox for any member of workspace (naive: pick owner mailbox)
    const { data: ownerMember } = await supabaseAdmin
      .from('workspaces')
      .select('owner_id')
      .eq('id', (t as any).workspace_id)
      .maybeSingle()
    const ownerId = (ownerMember as any)?.owner_id as string | undefined
    if (!ownerId) return NextResponse.json({ error: 'No workspace owner' }, { status: 400 })

    const { data: mb } = await supabaseAdmin
      .from('mailboxes')
      .select('provider, smtp_host, smtp_port, smtp_username, smtp_password, from_email, from_name')
      .eq('owner', ownerId)
      .maybeSingle()
    if (!mb) return NextResponse.json({ error: 'Mailbox not configured' }, { status: 400 })

    if (mb.provider === 'smtp') {
      const transporter = nodemailer.createTransport({
        host: (mb as any).smtp_host,
        port: Number((mb as any).smtp_port) || 587,
        secure: false,
        auth: (mb as any).smtp_username && (mb as any).smtp_password ? { user: (mb as any).smtp_username, pass: (mb as any).smtp_password } : undefined,
      })
      const info = await transporter.sendMail({
        from: `${(mb as any).from_name || 'SmartSend'} <${(mb as any).from_email || (mb as any).smtp_username}>`,
        to,
        subject,
        text: bodyText,
      })
      const accepted = Array.isArray((info as any)?.accepted) ? (info as any).accepted.length > 0 : true
      if (!accepted) return NextResponse.json({ error: 'Send rejected' }, { status: 502 })
    } else if (mb.provider === 'gmail') {
      // TODO: implement Gmail API send using stored refresh token if needed
      return NextResponse.json({ error: 'Gmail send not implemented yet' }, { status: 501 })
    } else {
      return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 })
    }

    // Insert outbound message into inbox_messages
    await supabaseAdmin
      .from('inbox_messages')
      .insert({ thread_id: threadId, sender: (mb as any).from_email || (mb as any).smtp_username, body: bodyText, is_incoming: false, sent_at: new Date().toISOString() })

    await supabaseAdmin
      .from('inbox_threads')
      .update({ last_message_at: new Date().toISOString(), status: 'open' })
      .eq('id', threadId)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 })
  }
}

