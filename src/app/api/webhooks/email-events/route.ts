import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { parseUrl, extractUrlFromEvent } from '@/lib/url-parser'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Types for normalized email events
interface NormalizedEvent {
  email_id: string | null
  campaign_id: string | null
  recipient: string | null
  subject: string | null
  event_type: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'replied'
  created_at: string
  clicked_url: string | null
  clicked_domain: string | null
  clicked_path: string | null
  metadata?: any
}

// Verify webhook signature for security
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: string = 'sha256'
): boolean {
  try {
    const expectedSignature = crypto
      .createHmac(algorithm, secret)
      .update(payload)
      .digest('hex')
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    )
  } catch {
    return false
  }
}

// Safe JSON parsing
function safeJson(str: string): any {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

// Convert timestamp to ISO string
function toISO(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts === 'number') {
    // Handle both seconds and milliseconds
    const timestamp = ts < 1e10 ? ts * 1000 : ts
    return new Date(timestamp).toISOString()
  }
  return new Date(ts).toISOString()
}

// Map provider event types to normalized types
function mapEvent(ev: string): NormalizedEvent['event_type'] {
  const s = (ev || '').toLowerCase()
  
  if (s.includes('click')) return 'clicked'
  if (s.includes('open')) return 'opened'
  if (s.includes('bounce')) return 'bounced'
  if (s.includes('complaint') || s.includes('spam')) return 'complained'
  if (s.includes('deliver')) return 'delivered'
  if (s.includes('reply')) return 'replied'
  
  return 'sent'
}

// Normalize events from different email providers
function normalizeProviderPayload(payload: any, provider: string): NormalizedEvent[] {
  const events: NormalizedEvent[] = []

  try {
    switch (provider) {
      case 'sendgrid':
        if (Array.isArray(payload)) {
          // SendGrid webhook array format
          events.push(...payload.map((e: any) => {
            const urlFields = parseUrl(e?.url || e?.["url"] || e?.["sg_url"]);
            return {
              email_id: e.smtp_id || e.sg_event_id || null,
              campaign_id: e.marketing_campaign_id || e.campaign_id || null,
              recipient: e.email || null,
              subject: e.subject || null,
              event_type: mapEvent(e.event),
              created_at: toISO(e.timestamp),
              clicked_url: urlFields.url,
              clicked_domain: urlFields.domain,
              clicked_path: urlFields.path,
              metadata: {
                provider: 'sendgrid',
                sg_message_id: e.sg_message_id,
                sg_event_id: e.sg_event_id,
                response: e.response,
                reason: e.reason,
                url: e.url,
                useragent: e.useragent,
                ip: e.ip
              }
            }
          }))
        }
        break

      case 'postmark':
        if (payload?.RecordType && payload?.Recipient) {
          // Postmark single event format
          const urlFields = parseUrl(payload?.OriginalLink || payload?.Link || payload?.Metadata?.link);
          events.push({
            email_id: payload.MessageID || null,
            campaign_id: payload.Metadata?.campaign_id || null,
            recipient: payload.Recipient || null,
            subject: payload.Metadata?.subject || payload.Subject || null,
            event_type: mapEvent(payload.RecordType),
            created_at: toISO(payload.ReceivedAt),
            clicked_url: urlFields.url,
            clicked_domain: urlFields.domain,
            clicked_path: urlFields.path,
            metadata: {
              provider: 'postmark',
              message_id: payload.MessageID,
              tag: payload.Tag,
              metadata: payload.Metadata
            }
          })
        }
        break

      case 'mailgun':
        if (Array.isArray(payload?.items) && payload?.signature) {
          // Mailgun webhook format
          events.push(...payload.items.map((e: any) => {
            const urlFields = parseUrl(e?.url || e?.message?.headers?.["List-Unsubscribe"]);
            return {
              email_id: e.message?.headers?.['message-id'] || null,
              campaign_id: e.tags?.[0] || null,
              recipient: e.recipient || null,
              subject: e.message?.headers?.subject || null,
              event_type: mapEvent(e.event),
              created_at: toISO(e.timestamp),
              clicked_url: urlFields.url,
              clicked_domain: urlFields.domain,
              clicked_path: urlFields.path,
              metadata: {
                provider: 'mailgun',
                message_id: e.message?.headers?.['message-id'],
                tags: e.tags,
                url: e.url,
                ip: e.ip,
                user_agent: e.user_agent
              }
            }
          }))
        }
        break

      case 'resend':
        if (payload?.type && payload?.data) {
          // Resend webhook format
          const urlFields = parseUrl(payload?.data?.url || payload?.url);
          events.push({
            email_id: payload.data?.email_id || null,
            campaign_id: payload.data?.campaign_id || null,
            recipient: payload.data?.to || null,
            subject: payload.data?.subject || null,
            event_type: mapEvent(payload.type),
            created_at: toISO(payload.created_at),
            clicked_url: urlFields.url,
            clicked_domain: urlFields.domain,
            clicked_path: urlFields.path,
            metadata: {
              provider: 'resend',
              email_id: payload.data?.email_id,
              message_id: payload.data?.message_id
            }
          })
        }
        break

      case 'ses':
        if (payload?.eventType && payload?.mail) {
          // AWS SES webhook format
          const urlFields = parseUrl(payload?.click?.link || payload?.url);
          events.push({
            email_id: payload.mail?.messageId || null,
            campaign_id: payload.mail?.tags?.campaign_id?.[0] || null,
            recipient: payload.mail?.destination?.[0] || null,
            subject: payload.mail?.commonHeaders?.subject || null,
            event_type: mapEvent(payload.eventType),
            created_at: toISO(payload.eventTimestamp),
            clicked_url: urlFields.url,
            clicked_domain: urlFields.domain,
            clicked_path: urlFields.path,
            metadata: {
              provider: 'ses',
              message_id: payload.mail?.messageId,
              source: payload.mail?.source,
              tags: payload.mail?.tags
            }
          })
        }
        break

      default:
        // Generic fallback for unknown providers
        const eventType = payload?.event || payload?.type || payload?.event_type
        const recipient = payload?.recipient || payload?.email || payload?.to
        const subject = payload?.subject
        const urlFields = parseUrl(payload?.url || payload?.link || payload?.clicked_url)
        
        if (eventType && recipient) {
          events.push({
            email_id: payload?.message_id || payload?.email_id || null,
            campaign_id: payload?.campaign_id || null,
            recipient,
            subject: subject || null,
            event_type: mapEvent(eventType),
            created_at: toISO(payload?.timestamp || payload?.created_at),
            clicked_url: urlFields.url,
            clicked_domain: urlFields.domain,
            clicked_path: urlFields.path,
            metadata: {
              provider: provider || 'unknown',
              raw: payload
            }
          })
        }
    }
  } catch (error) {
    console.error(`Error normalizing ${provider} payload:`, error)
  }

  return events.filter(Boolean)
}

// Detect provider from request headers and payload
function detectProvider(req: NextRequest, payload: any): string {
  const userAgent = req.headers.get('user-agent') || ''
  const contentType = req.headers.get('content-type') || ''
  
  // Check headers for provider signatures
  if (req.headers.get('x-sendgrid-signature')) return 'sendgrid'
  if (req.headers.get('x-postmark-signature')) return 'postmark'
  if (req.headers.get('x-mailgun-signature')) return 'mailgun'
  if (req.headers.get('x-resend-signature')) return 'resend'
  if (req.headers.get('x-amz-sns-message-type')) return 'ses'
  
  // Check payload structure
  if (Array.isArray(payload) && payload[0]?.sg_event_id) return 'sendgrid'
  if (payload?.RecordType && payload?.Recipient) return 'postmark'
  if (Array.isArray(payload?.items) && payload?.signature) return 'mailgun'
  if (payload?.type && payload?.data) return 'resend'
  if (payload?.eventType && payload?.mail) return 'ses'
  
  return 'unknown'
}

export async function POST(req: NextRequest) {
  try {
    // Read raw body for signature verification
    const rawBody = await req.text()
    const payload = safeJson(rawBody)
    
    if (!payload) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    // Detect provider
    const provider = detectProvider(req, payload)
    
    // Verify webhook signature if secret is configured
    const webhookSecret = process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`]
    if (webhookSecret) {
      const signature = req.headers.get(`x-${provider}-signature`) || 
                       req.headers.get('x-signature') ||
                       req.headers.get('x-webhook-signature')
      
      if (!signature || !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    // Normalize events from the provider
    const normalizedEvents = normalizeProviderPayload(payload, provider)
    
    if (normalizedEvents.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        message: 'No events to process',
        provider,
        events_count: 0
      })
    }

    // Insert events into database
    const { data, error } = await supabase
      .from('email_events')
      .insert(
        normalizedEvents.map(e => ({
          email_id: e.email_id,
          campaign_id: e.campaign_id,
          recipient: e.recipient,
          subject: e.subject,
          event_type: e.event_type,
          created_at: e.created_at,
          clicked_url: e.clicked_url ?? null,
          clicked_domain: e.clicked_domain ?? null,
          clicked_path: e.clicked_path ?? null,
          metadata: e.metadata
        }))
      )
      .select('id')

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ 
        ok: false, 
        error: error.message 
      }, { status: 500 })
    }

    // Log successful processing
    console.log(`Processed ${normalizedEvents.length} events from ${provider}`)

    return NextResponse.json({ 
      ok: true, 
      inserted: data?.length ?? 0,
      provider,
      events_count: normalizedEvents.length
    })

  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ 
    ok: true, 
    message: 'Email events webhook endpoint is healthy',
    timestamp: new Date().toISOString()
  })
}