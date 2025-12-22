import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { CalendlyWebhookPayload } from '@/types/meetings';

// Calendly webhook handler for meeting status updates
export async function POST(req: Request) {
  try {
    const body: CalendlyWebhookPayload = await req.json().catch(() => ({} as CalendlyWebhookPayload));
    
    // Handle Calendly webhook events
    const { event, payload } = body;
    
    if (event === 'invitee.created' || event === 'invitee.updated') {
      const { invitee, event: calendlyEvent } = payload;
      
      // Try to find existing meeting by external_event_id or create new one
      let meetingId = null;
      
      if (calendlyEvent.uri) {
        // Check if we have a meeting with this event URI
        const { data: existing } = await supabaseAdmin
          .from('meetings')
          .select('id')
          .eq('event_uri', calendlyEvent.uri)
          .single();
        
        if (existing) {
          meetingId = existing.id;
        }
      }
      
      if (meetingId) {
        // Update existing meeting
        const { error } = await supabaseAdmin
          .from('meetings')
          .update({
            status: 'booked',
            booked_at: new Date().toISOString(),
            invitee_uri: invitee.uri,
            event_uri: calendlyEvent.uri,
            external_source: 'calendly',
            external_event_id: calendlyEvent.uuid,
            location: calendlyEvent.location?.location || 'Video Call',
            start_at: invitee.start_time,
            end_at: invitee.end_time,
          })
          .eq('id', meetingId);
        
        if (error) {
          console.error('Error updating meeting:', error);
          return NextResponse.json({ error: 'Failed to update meeting' }, { status: 500 });
        }
      }
      
      return NextResponse.json({ ok: true, meetingId });
    }
    
    if (event === 'invitee.canceled') {
      const { invitee, event: calendlyEvent } = payload;
      
      // Find and update meeting status
      if (calendlyEvent.uri) {
        const { error } = await supabaseAdmin
          .from('meetings')
          .update({
            status: 'canceled',
            external_source: 'calendly',
            external_event_id: calendlyEvent.uuid,
          })
          .eq('event_uri', calendlyEvent.uri);
        
        if (error) {
          console.error('Error canceling meeting:', error);
          return NextResponse.json({ error: 'Failed to cancel meeting' }, { status: 500 });
        }
      }
      
      return NextResponse.json({ ok: true });
    }
    
    return NextResponse.json({ ok: true, message: 'Event processed' });
  } catch (e: any) {
    console.error('Calendly webhook error:', e);
    return NextResponse.json({ 
      error: 'Webhook processing failed', 
      details: String(e?.message || e) 
    }, { status: 500 });
  }
} 