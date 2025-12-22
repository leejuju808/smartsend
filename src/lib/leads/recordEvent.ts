/**
 * Lead Event Recording
 * 
 * Call this function whenever a lead engagement event occurs:
 * - Email opened → event_type: 'open'
 * - Link clicked → event_type: 'click'
 * - Reply detected → event_type: 'reply'
 * - Manual call logged → event_type: 'call'
 * - Meeting scheduled → event_type: 'meeting'
 * - Unsubscribed → event_type: 'unsubscribe'
 * - Bounced → event_type: 'bounce'
 */

interface RecordEventParams {
  orgId: string;
  leadId: string;
  eventType: 'open' | 'click' | 'reply' | 'call' | 'meeting' | 'unsubscribe' | 'bounce';
  metadata?: Record<string, any>;
  occurredAt?: string;
}

/**
 * Record a lead engagement event
 * This will trigger automatic score recomputation via database triggers
 */
export async function recordEvent(params: RecordEventParams): Promise<void> {
  try {
    // Call the lead-intent edge function
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/lead-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        org_id: params.orgId,
        lead_id: params.leadId,
        event_type: params.eventType,
        metadata: params.metadata || {},
        occurred_at: params.occurredAt,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('Failed to record lead event:', error);
      throw new Error(`Failed to record event: ${error.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error recording lead event:', error);
    // Don't throw - we don't want to block the main flow if event recording fails
  }
}

/**
 * Convenience wrapper to record multiple events at once
 */
export async function recordEvents(events: RecordEventParams[]): Promise<void> {
  await Promise.all(events.map(event => recordEvent(event)));
}

