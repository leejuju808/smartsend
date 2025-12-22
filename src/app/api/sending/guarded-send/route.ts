import { NextRequest, NextResponse } from 'next/server';
import { reserveAndSend } from '@/lib/sending/guard';
import { sendEmail } from '@/lib/replies/sendEmail';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, toEmail, subject, html, text } = await req.json();
    if (!workspaceId || !toEmail) {
      return NextResponse.json({ error: 'workspaceId and toEmail required' }, { status: 400 });
    }

    const result = await reserveAndSend(workspaceId, toEmail, async () => {
      await sendEmail({
        toEmail,
        fromEmail: process.env.REPLY_FROM_EMAIL!,
        fromName: process.env.REPLY_FROM_NAME || 'SmartSend',
        subject: subject || 'Hello from SmartSend',
        html: html || '<p>Hello!</p>',
        text: text || 'Hello!',
      });
    });

    return NextResponse.json({ ok: result.allowed, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'guarded send failed' }, { status: 500 });
  }
} 