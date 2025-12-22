// @ts-ignore
import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST!;
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER!;
const pass = process.env.SMTP_PASS!;
const from = process.env.FROM_EMAIL || 'no-reply@smartsend.ai';

if (!host || !user || !pass) {
  console.warn('⚠️ SMTP not fully configured');
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
});

export async function sendMeetingConfirmation(opts: {
  to: string;
  subject: string;
  text: string;
  ics: { filename: string; content: string };
}) {
  if (!host || !user || !pass) return { ok: false, error: 'SMTP not configured' };
  const info = await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    alternatives: [
      {
        contentType: 'text/calendar; method=REQUEST',
        content: opts.ics.content,
        filename: opts.ics.filename,
      },
    ],
    attachments: [
      {
        filename: opts.ics.filename,
        content: opts.ics.content,
        contentType: 'text/calendar',
      },
    ],
  });
  return { ok: true, id: info.messageId };
}

export type AttachmentLike = {
  filename: string
  content: string | Buffer
  contentType?: string
}

export type SendMailArgs = {
  to: string
  from: string
  subject: string
  html: string
  text?: string
  headers?: Record<string, string>
  attachments?: AttachmentLike[]
  userId?: string // For Gmail provider
  threadId?: string | null
  inReplyTo?: string | null
  references?: string | null
}

export async function sendMail(args: SendMailArgs) {
  const provider = process.env.MAIL_PROVIDER || 'smtp' // 'resend' | 'smtp' | 'gmail'
  
  // Gmail provider (requires userId)
  if (provider === 'gmail' || (args.userId && process.env.MAIL_PROVIDER === 'gmail')) {
    if (!args.userId) throw new Error('userId required for Gmail provider')
    const { gmailSend } = await import('@/lib/gmail-send')
    return gmailSend(args.userId, {
      to: args.to,
      subject: args.subject,
      html: args.html,
      threadId: args.threadId,
      inReplyTo: args.inReplyTo,
      references: args.references
    })
  }
  
  if (provider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('RESEND_API_KEY missing')
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    const res = await resend.emails.send({
      from: args.from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
      headers: args.headers,
      attachments: args.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
      }))
    })
    if (res.error) throw new Error(String(res.error))
    // @ts-ignore (Resend types)
    const messageId = (res.data?.id || res.id || res.messageId || '').toString()
    return { provider: 'resend', messageId }
  }

  // SMTP
  const smtpHost = process.env.SMTP_HOST
  const smtpPort = Number(process.env.SMTP_PORT || 587)
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  if (!smtpHost || !smtpUser || !smtpPass) throw new Error('SMTP_* envs missing')

  const smtpTransporter = nodemailer.createTransport({
    host: smtpHost, 
    port: smtpPort, 
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass }
  })

  const info = await smtpTransporter.sendMail({
    from: args.from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
    headers: args.headers,
    attachments: args.attachments?.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType ?? 'application/octet-stream'
    }))
  })

  return { provider: 'smtp', messageId: info.messageId || '' }
}

