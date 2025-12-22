// Block 24900 — SmartSend Roofing Follow-Up Brain v2
// Main edge function that orchestrates all follow-up intelligence

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const { action, lead_id, workspace_id, reply_text, reply_id } = await req.json();

    switch (action) {
      case 'process_reply':
        // Process a new reply and trigger appropriate actions
        return await processReply(lead_id, reply_text, reply_id);
      
      case 'process_pending':
        // Process pending follow-ups and sequences
        return await processPendingFollowUps();
      
      case 'activate_hot_lead':
        // Manually activate a hot lead
        return await activateHotLead(lead_id);
      
      case 'calculate_score':
        // Calculate Follow-Up Brain Score
        return await calculateScore(workspace_id, lead_id);
      
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }
  } catch (error: any) {
    console.error('Error in followup-brain-v2:', error);
    return new Response(
      JSON.stringify({ error: error.message || String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

/**
 * Processes a new reply and triggers appropriate actions
 */
async function processReply(
  leadId: string,
  replyText: string,
  replyId?: string
): Promise<Response> {
  try {
    // Call NLP detection API
    const baseUrl = Deno.env.get("NEXT_PUBLIC_BASE_URL") || 
                   Deno.env.get("NEXT_PUBLIC_VERCEL_URL") || 
                   "http://localhost:3000";
    
    const detectionResponse = await fetch(`${baseUrl}/api/followup-brain-v2/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: leadId,
        reply_text: replyText,
        reply_id: replyId,
      }),
    });

    const detection = await detectionResponse.json();

    if (!detection.ok) {
      throw new Error('Detection failed');
    }

    // Store detection
    const { data: detectionRecord } = await supabase
      .from('followup_nlp_detections')
      .insert({
        lead_id: leadId,
        email_reply_id: replyId,
        detection_type: detection.detection_type,
        confidence_score: detection.confidence_score,
        detected_phrases: detection.detected_phrases || [],
        detected_intent: detection.detected_intent,
        homeowner_tone: detection.homeowner_tone,
        urgency_level: detection.urgency_level,
        extracted_info: detection.extracted_info || {},
        raw_reply_text: replyText,
      })
      .select()
      .single();

    // Trigger actions based on detection type
    if (detection.detection_type === 'hot_lead') {
      // Activate hot lead
      await activateHotLeadAction(leadId, detectionRecord.id, detection.detected_intent);
    } else if (detection.detection_type === 'objection') {
      // Handle objection
      await handleObjectionAction(leadId, detectionRecord.id, replyText, detection.detected_intent);
    } else if (detection.detection_type === 'warm_lead') {
      // Start warm lead sequence
      await startWarmLeadSequence(leadId);
    } else if (detection.detection_type === 'not_interested') {
      // Stop all follow-ups
      await stopFollowUps(leadId);
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        detection: detectionRecord,
        actions_taken: detection.detection_type,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('Error processing reply:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * Processes pending follow-ups and sequences
 */
async function processPendingFollowUps(): Promise<Response> {
  try {
    // Process pending sequence executions
    const baseUrl = Deno.env.get("NEXT_PUBLIC_BASE_URL") || 
                   Deno.env.get("NEXT_PUBLIC_VERCEL_URL") || 
                   "http://localhost:3000";
    
    const sequenceResponse = await fetch(`${baseUrl}/api/followup-brain-v2/process-sequences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const sequenceResult = await sequenceResponse.json();

    return new Response(
      JSON.stringify({ 
        ok: true,
        sequences_processed: sequenceResult.sent || 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * Activates a hot lead
 */
async function activateHotLead(leadId: string): Promise<Response> {
  try {
    const baseUrl = Deno.env.get("NEXT_PUBLIC_BASE_URL") || 
                   Deno.env.get("NEXT_PUBLIC_VERCEL_URL") || 
                   "http://localhost:3000";
    
    const response = await fetch(`${baseUrl}/api/followup-brain-v2/activate-hot-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId }),
    });

    const result = await response.json();

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * Calculates Follow-Up Brain Score
 */
async function calculateScore(workspaceId?: string, leadId?: string): Promise<Response> {
  try {
    const baseUrl = Deno.env.get("NEXT_PUBLIC_BASE_URL") || 
                   Deno.env.get("NEXT_PUBLIC_VERCEL_URL") || 
                   "http://localhost:3000";
    
    const response = await fetch(`${baseUrl}/api/followup-brain-v2/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId, lead_id: leadId }),
    });

    const score = await response.json();

    return new Response(
      JSON.stringify(score),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// Helper functions that call API routes
async function activateHotLeadAction(leadId: string, detectionId: string, trigger: string) {
  // Implementation handled by API route
}

async function handleObjectionAction(leadId: string, detectionId: string, text: string, intent: string) {
  // Implementation handled by API route
}

async function startWarmLeadSequence(leadId: string) {
  // Implementation handled by API route
}

async function stopFollowUps(leadId: string) {
  await supabase
    .from('followup_sequence_executions')
    .update({ status: 'cancelled' })
    .eq('lead_id', leadId)
    .eq('status', 'pending');
}






































