import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/src/server/supabase';

export const runtime = 'edge';

interface SaveLeadDataRequest {
  session_id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  property_type?: string;
  roof_type?: string;
  issue_type?: string;
  urgency_level?: string;
  preferred_contact_method?: string;
  preferred_time?: string;
  insurance_claim?: boolean;
  insurance_company?: string;
  notes?: string;
  additional_info?: Record<string, any>;
}

export async function POST(req: NextRequest) {
  try {
    const body: SaveLeadDataRequest = await req.json();
    const { session_id, ...leadData } = body;

    if (!session_id) {
      return NextResponse.json(
        { error: 'session_id is required' },
        { status: 400 }
      );
    }

    // Verify session exists
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('web_chat_sessions')
      .select('id, workspace_id')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Parse name into first_name and last_name if needed
    if (leadData.name && !leadData.first_name) {
      const nameParts = leadData.name.trim().split(/\s+/);
      leadData.first_name = nameParts[0] || null;
      leadData.last_name = nameParts.slice(1).join(' ') || null;
    }

    // Check if lead data already exists for this session
    const { data: existing } = await supabaseAdmin
      .from('web_chat_lead_data')
      .select('id')
      .eq('session_id', session_id)
      .single();

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabaseAdmin
        .from('web_chat_lead_data')
        .update({
          ...leadData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      
      result = data;
      if (error) {
        console.error('Error updating lead data:', error);
        return NextResponse.json(
          { error: 'Failed to update lead data' },
          { status: 500 }
        );
      }
    } else {
      // Insert new
      const { data, error } = await supabaseAdmin
        .from('web_chat_lead_data')
        .insert({
          session_id,
          ...leadData,
        })
        .select()
        .single();
      
      result = data;
      if (error) {
        console.error('Error saving lead data:', error);
        return NextResponse.json(
          { error: 'Failed to save lead data' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      lead_data: result,
    });
  } catch (error: any) {
    console.error('Error in /api/chat/lead/save:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

























