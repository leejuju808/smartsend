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

  // Update lead as unsubscribed
  const { error: leadError } = await supabaseAdmin
    .from('leads')
    .update({ unsubscribed: true })
    .eq('id', payload.leadId)
    .eq('owner_email', payload.ownerEmail)

  if (leadError) return bad('Something went wrong. Please try again later.')

  // Purge future sequence sends for this contact
  try {
    // Find any active campaign recipients for this lead
    const { data: recipients } = await supabaseAdmin
      .from('campaign_recipients')
      .select('id, campaign_id, step_index, last_sent_step')
      .eq('contact_id', payload.leadId)
      .in('status', ['queued', 'sent']);

    if (recipients && recipients.length > 0) {
      for (const recipient of recipients) {
        // Check if this is a sequence campaign
        const { data: campaign } = await supabaseAdmin
          .from('campaigns')
          .select('is_sequence')
          .eq('id', recipient.campaign_id)
          .maybeSingle();

        if (campaign?.is_sequence) {
          const currentStep = recipient.last_sent_step || recipient.step_index || 0;
          
          // Delete any queued future sends for this contact
          await supabaseAdmin
            .from('campaign_recipients')
            .delete()
            .eq('campaign_id', recipient.campaign_id)
            .eq('contact_id', payload.leadId)
            .gt('step_index', currentStep);
        }
      }
    }
  } catch (purgeError) {
    console.error('Error purging future sequence sends:', purgeError);
    // Don't fail the unsubscribe if purging fails
  }

  const html = `<!doctype html><html><body style="font-family:system-ui;padding:32px"><h1>You’re unsubscribed ✅</h1><p>You won’t receive further emails from this sender.</p></body></html>`
  return new Response(html, { headers: { 'content-type': 'text/html' } })
}

