// Block 22126 — SmartSend Roofing Homeowner Transcript v1
// Edge Function — Insert Transcript Message
//
// This edge function inserts a message into the transcript_messages table
// and automatically creates a timeline event. It's called by:
// - Email ingestion pipeline
// - SMS ingestion pipeline
// - AI actions
// - Message builder
// - Manual messages
//
// Input: {
//   lead_id,
//   workspace_id,
//   sender_type,      // 'homeowner' | 'estimator' | 'system' | 'ai'
//   sender_name,
//   message_text,
//   tone,              // optional, from Tone Engine
//   intent,            // optional, from Intent Engine
//   sentiment_score,   // optional, 0-100
//   experience_impact, // optional, +/- change to experience score
//   source_type,       // optional, 'email' | 'sms' | 'phone_call_summary' | 'ai_reply' | 'manual'
//   source_id,         // optional, reference to email_id, sms_id, etc.
//   thread_id          // optional, for grouping related messages
// }

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const {
    lead_id,
    workspace_id,
    sender_type,
    sender_name,
    message_text,
    tone,
    intent,
    sentiment_score,
    experience_impact,
    source_type,
    source_id,
    thread_id
  } = await req.json();

  // Validate required fields
  if (!lead_id || !workspace_id || !sender_type || !message_text) {
    return new Response(
      JSON.stringify({ 
        error: "Missing required fields: lead_id, workspace_id, sender_type, and message_text are required" 
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Validate sender_type
  const validSenderTypes = ['homeowner', 'estimator', 'system', 'ai'];
  if (!validSenderTypes.includes(sender_type)) {
    return new Response(
      JSON.stringify({ 
        error: `Invalid sender_type. Must be one of: ${validSenderTypes.join(', ')}` 
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Use the helper function to insert transcript message and create timeline event
  const { data, error } = await supabase.rpc('insert_transcript_message_with_timeline', {
    p_lead_id: lead_id,
    p_workspace_id: workspace_id,
    p_sender_type: sender_type,
    p_sender_name: sender_name || null,
    p_message_text: message_text,
    p_tone: tone || null,
    p_intent: intent || null,
    p_sentiment_score: sentiment_score || null,
    p_experience_impact: experience_impact || null,
    p_source_type: source_type || null,
    p_source_id: source_id || null,
    p_thread_id: thread_id || null
  });

  if (error) {
    console.error('Error inserting transcript message:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Block 22179 — Hot Lead Detector: Trigger detection for homeowner messages
  if (sender_type === 'homeowner' && message_text) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const detectHotLeadUrl = `${supabaseUrl}/functions/v1/detect-hot-lead`;
    
    // Trigger hot lead detection asynchronously (don't wait for response)
    fetch(detectHotLeadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        lead_id: lead_id,
        homeowner_message: message_text,
        transcript_snapshot: null, // Will be fetched by the function
      }),
    }).catch((err) => {
      console.error("Error triggering hot lead detection:", err);
      // Don't fail the request if hot lead detection fails
    });
  }

  return new Response(
    JSON.stringify({ success: true, transcript_id: data }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});

