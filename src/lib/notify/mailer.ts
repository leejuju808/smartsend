import 'server-only'

type SendArgs = { to: string; subject: string; text: string }

type SendHtmlArgs = { 
  to: string; 
  subject: string; 
  html: string; 
  fromName?: string; 
  fromEmail?: string; 
}

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

export async function sendHtmlEmail({ to, subject, html, fromName, fromEmail }: SendHtmlArgs) {
  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    
    const from = fromEmail || process.env.RESEND_FROM || 'billing@yourapp.com'
    const fromDisplay = fromName ? `${fromName} <${from}>` : from
    
    await resend.emails.send({ 
      from: fromDisplay, 
      to, 
      subject, 
      html 
    })
    return
  }
  
  // Fallback: log only (dev/staging)
  console.log(JSON.stringify({ 
    event: 'send_html_email_fallback', 
    to, 
    subject, 
    fromName, 
    fromEmail 
  }))
}

