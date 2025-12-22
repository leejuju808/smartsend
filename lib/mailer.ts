import type { AttachmentLike } from './mailerTypes'
import nodemailer from 'nodemailer'

export type SendMailArgs = {
  to: string
  from: string
  subject: string
  html: string
  text?: string
  headers?: Record<string, string>
  attachments?: AttachmentLike[]
}

export async function sendMail(args: SendMailArgs) {
  const provider = process.env.MAIL_PROVIDER || 'smtp' // 'resend' | 'smtp'
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
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) throw new Error('SMTP_* envs missing')

  const transporter = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user, pass }
  })

  const info = await transporter.sendMail({
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
