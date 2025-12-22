import type { EmailDraft } from './types';

async function sendViaResend(d: EmailDraft) {
  const key = process.env.RESEND_API_KEY!;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: `${d.fromName} <${d.fromEmail}>`,
      to: [d.toEmail],
      subject: d.subject,
      html: d.html,
      text: d.text,
      attachments: d.ics ? [{ 
        filename: d.ics.filename, 
        content: Buffer.from(d.ics.content, 'utf8').toString('base64'), 
        content_type: 'text/calendar' 
      }] : undefined,
    })
  });
  if (!res.ok) throw new Error(`Resend: ${res.status} ${await res.text()}`);
}

async function sendViaSendGrid(d: EmailDraft) {
  const key = process.env.SENDGRID_API_KEY!;
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: d.toEmail }] }],
      from: { email: d.fromEmail, name: d.fromName },
      subject: d.subject,
      content: [ 
        { type: 'text/plain', value: d.text }, 
        { type: 'text/html', value: d.html } 
      ],
      attachments: d.ics ? [{
        content: Buffer.from(d.ics.content, 'utf8').toString('base64'),
        filename: d.ics.filename,
        type: 'text/calendar',
        disposition: 'attachment'
      }] : undefined
    })
  });
  if (!res.ok) throw new Error(`SendGrid: ${res.status} ${await res.text()}`);
}

async function sendViaPostmark(d: EmailDraft) {
  const key = process.env.POSTMARK_SERVER_TOKEN!;
  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Postmark-Server-Token': key },
    body: JSON.stringify({
      From: `${d.fromName} <${d.fromEmail}>`,
      To: d.toEmail,
      Subject: d.subject,
      HtmlBody: d.html,
      TextBody: d.text,
      Attachments: d.ics ? [{ 
        Name: d.ics.filename, 
        Content: Buffer.from(d.ics.content, 'utf8').toString('base64'), 
        ContentType: 'text/calendar' 
      }] : undefined
    })
  });
  if (!res.ok) throw new Error(`Postmark: ${res.status} ${await res.text()}`);
}

export async function sendEmail(d: EmailDraft) {
  if (process.env.RESEND_API_KEY) return sendViaResend(d);
  if (process.env.SENDGRID_API_KEY) return sendViaSendGrid(d);
  if (process.env.POSTMARK_SERVER_TOKEN) return sendViaPostmark(d);
  throw new Error('No email provider configured');
}

export function hasEmailProvider(): boolean {
  return !!(process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY || process.env.POSTMARK_SERVER_TOKEN);
} 