import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('EMAIL_FROM')! // "SmartSend <no-reply@smartsendhq.com>"

async function sendEmail(to: string, subject: string, html: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: FROM, to, subject, html })
  })
  if (!r.ok) throw new Error(await r.text())
}

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 })
  }
  const body = await req.json() as any

  if (body.kind === 'share-existing') {
    const subject = `You've been added to a SmartSend campaign`
    const html = `
      <h3>Access granted</h3>
      <p>You were added as <b>${body.role}</b> to campaign <code>${body.campaignId}</code>.</p>
      <p><a href="${Deno.env.get('APP_ORIGIN')}/campaigns/${body.campaignId}">Open campaign</a></p>
    `
    await sendEmail(body.email, subject, html)
    return new Response('ok')
  }

  if (body.kind === 'share-invite') {
    const subject = `You're invited to a SmartSend campaign`
    const html = `
      <h3>Join SmartSend</h3>
      <p>You were invited as <b>${body.role}</b> to a campaign.</p>
      <p><a href="${body.acceptUrl}">Accept invite</a> (link expires in 14 days)</p>
    `
    await sendEmail(body.email, subject, html)
    return new Response('ok')
  }

  if (body.kind === 'org-invite') {
    const subject = `You're invited to a SmartSend workspace`
    const html = `
      <h3>Join workspace</h3>
      <p>You were invited as <b>${body.role}</b> to a workspace.</p>
      <p><a href="${body.acceptUrl}">Accept invite</a> (expires in 14 days)</p>
    `
    await sendEmail(body.email, subject, html)
    return new Response('ok')
  }

  return new Response('bad-kind', { status: 400 })
})

