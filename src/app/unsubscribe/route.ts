import 'server-only'
import { supabaseAdmin } from '@/server/supabase'
import { verifyUnsubToken } from '@/server/unsub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = String(url.searchParams.get('token') || '')

  const bad = (msg: string) =>
    new Response(`<!doctype html><html><body style="font-family:system-ui;padding:32px"><h1>Unsubscribe</h1><p>${msg}</p></body></html>`, {
      status: 400,
      headers: { 'content-type': 'text/html' },
    })

  const payload = verifyUnsubToken(token)
  if (!payload) return bad('Invalid or expired link.')

  const { error } = await supabaseAdmin
    .from('leads')
    .update({ unsubscribed: true })
    .eq('id', payload.leadId)
    .eq('owner_email', payload.ownerEmail)

  if (error) return bad('Something went wrong. Please try again later.')

  const html = `<!doctype html><html><body style="font-family:system-ui;padding:32px"><h1>You’re unsubscribed ✅</h1><p>You won’t receive further emails from this sender.</p></body></html>`
  return new Response(html, { headers: { 'content-type': 'text/html' } })
}

