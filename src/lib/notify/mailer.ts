import 'server-only'

type SendArgs = { to: string; subject: string; text: string }

export async function sendEmail({ to, subject, text }: SendArgs) {
  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({ from: process.env.RESEND_FROM || 'billing@yourapp.com', to, subject, text })
    return
  }
  // Fallback: log only (dev/staging)
  console.log(JSON.stringify({ event: 'send_email_fallback', to, subject }))
}

