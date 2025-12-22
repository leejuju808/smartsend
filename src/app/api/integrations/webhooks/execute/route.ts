import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import crypto from 'crypto'

/**
 * Internal route to execute webhooks when events occur
 * This is called by the automation system or other internal services
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { event_type, event_data, company_id } = body

    if (!event_type || !event_data || !company_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          get: () => undefined,
          set: () => {},
          remove: () => {},
        },
      }
    )

    // Find all active webhooks that listen to this event type
    const { data: webhooks, error: webhooksError } = await supabase
      .from('webhooks_outgoing')
      .select('*')
      .eq('roofing_company_id', company_id)
      .eq('is_active', true)
      .contains('event_types', [event_type])

    if (webhooksError || !webhooks || webhooks.length === 0) {
      return NextResponse.json({ success: true, executed: 0 })
    }

    const results = []

    // Execute each webhook
    for (const webhook of webhooks) {
      try {
        // Build payload
        const payload = webhook.payload_template && Object.keys(webhook.payload_template).length > 0
          ? buildCustomPayload(webhook.payload_template, event_data)
          : { event_type, data: event_data }

        // Generate HMAC signature
        const signature = crypto
          .createHmac('sha256', webhook.secret || '')
          .update(JSON.stringify(payload))
          .digest('hex')

        // Send webhook
        const startTime = Date.now()
        const res = await fetch(webhook.url, {
          method: webhook.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': event_type,
          },
          body: JSON.stringify(payload),
        })

        const duration = Date.now() - startTime
        const responseBody = await res.text().catch(() => '')

        // Log execution
        await supabase.from('webhook_event_logs').insert({
          webhook_id: webhook.id,
          event_type,
          event_data,
          payload_sent: payload,
          status: res.ok ? 'success' : 'failed',
          response_code: res.status,
          response_body: responseBody.substring(0, 1000), // Limit size
          error_message: res.ok ? null : `HTTP ${res.status}: ${responseBody.substring(0, 200)}`,
          executed_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: duration,
        })

        results.push({
          webhook_id: webhook.id,
          status: res.ok ? 'success' : 'failed',
          response_code: res.status,
        })
      } catch (error: any) {
        // Log error
        await supabase.from('webhook_event_logs').insert({
          webhook_id: webhook.id,
          event_type,
          event_data,
          payload_sent: {},
          status: 'failed',
          error_message: error.message,
          executed_at: new Date().toISOString(),
        })

        results.push({
          webhook_id: webhook.id,
          status: 'failed',
          error: error.message,
        })
      }
    }

    return NextResponse.json({ success: true, executed: results.length, results })
  } catch (error: any) {
    console.error('Error executing webhooks:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function buildCustomPayload(template: any, eventData: any): any {
  // Simple template engine: replace {{field}} with values from event_data
  const payload: any = {}
  
  for (const [key, value] of Object.entries(template)) {
    if (typeof value === 'string') {
      // Replace template variables like {{field_name}}
      payload[key] = value.replace(/\{\{(\w+)\}\}/g, (match, field) => {
        return eventData[field] !== undefined ? eventData[field] : match
      })
    } else if (typeof value === 'object' && value !== null) {
      payload[key] = buildCustomPayload(value, eventData)
    } else {
      payload[key] = value
    }
  }
  
  return payload
}

























