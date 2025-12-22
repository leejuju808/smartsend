import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processCallIntelligence } from '../process-utils'
import { insertUnifiedMessage, getCompanyIdFromWorkspace, getCompanyIdFromLead } from '@/lib/unified-messages'

/**
 * POST /api/calls/ingest
 * Ingest call transcript data (from VoIP provider or mobile forwarding)
 * Creates call_transcript record and triggers AI processing
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await req.json()
    const {
      workspace_id,
      thread_id,
      contact_id,
      lead_id,
      caller_number,
      called_number,
      call_direction,
      duration_seconds,
      call_timestamp,
      audio_url,
      transcription, // Auto-generated transcription from provider
    } = body

    // Validate required fields
    if (!workspace_id || !caller_number || !transcription || !call_direction) {
      return NextResponse.json(
        { error: 'Missing required fields: workspace_id, caller_number, transcription, call_direction' },
        { status: 400 }
      )
    }

    // Verify workspace access
    const { data: workspace } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .single()

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    }

    // Create call transcript record
    const { data: callTranscript, error: insertError } = await supabase
      .from('call_transcripts')
      .insert({
        workspace_id,
        thread_id: thread_id || null,
        contact_id: contact_id || null,
        lead_id: lead_id || null,
        caller_number,
        called_number: called_number || null,
        call_direction,
        duration_seconds: duration_seconds || 0,
        call_timestamp: call_timestamp ? new Date(call_timestamp).toISOString() : new Date().toISOString(),
        audio_url: audio_url || null,
        transcription,
        transcription_status: 'completed',
        ai_summary_status: 'pending',
        ai_intent_status: 'pending',
        ai_outcome_status: 'pending',
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating call transcript:', insertError)
      return NextResponse.json(
        { error: 'Failed to create call transcript', details: insertError.message },
        { status: 500 }
      )
    }

    // Block 150000: Insert into unified messages table
    try {
      let companyId = null;
      if (lead_id) {
        companyId = await getCompanyIdFromLead(lead_id);
      }
      if (!companyId) {
        companyId = await getCompanyIdFromWorkspace(workspace_id);
      }

      if (companyId) {
        // Get caller name if available
        let senderName = caller_number;
        if (lead_id) {
          const { data: lead } = await supabase
            .from("leads")
            .select("name, first_name, last_name, phone")
            .eq("id", lead_id)
            .maybeSingle();
          
          if (lead) {
            senderName = lead.name || 
              (lead.first_name || lead.last_name 
                ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
                : caller_number);
          }
        }

        // Create a summary snippet from transcription
        const transcriptSnippet = transcription.length > 200 
          ? transcription.substring(0, 200) + "..."
          : transcription;

        await insertUnifiedMessage({
          company_id: companyId,
          lead_id: lead_id || null,
          channel: "call",
          direction: call_direction === "inbound" ? "incoming" : "outgoing",
          sender: senderName,
          sender_phone: caller_number,
          body: `Call transcript: ${transcriptSnippet}`,
          metadata: {
            call_transcript_id: callTranscript.id,
            duration_seconds: duration_seconds || 0,
            call_timestamp: call_timestamp || new Date().toISOString(),
            audio_url: audio_url || null,
            full_transcription: transcription,
            transcription_status: "completed",
          },
          external_id: callTranscript.id,
        });
      }
    } catch (unifiedError) {
      console.warn("Failed to insert unified message for call transcript:", unifiedError);
      // Don't throw - unified message insertion failure shouldn't break call processing
    }

    // Trigger AI processing asynchronously (don't wait)
    processCallIntelligence(callTranscript.id).catch((error) => {
      console.error('Error processing call intelligence:', error)
    })

    return NextResponse.json({
      success: true,
      call_id: callTranscript.id,
      message: 'Call transcript ingested successfully. AI processing started.',
    })
  } catch (error: any) {
    console.error('Error in call ingest:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

