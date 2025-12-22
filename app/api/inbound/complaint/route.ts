import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/inbound/complaint
 * 
 * SmartSend Safety Net v1 - Spam Complaint Handler
 * Processes spam complaints, auto-suppresses contacts, and logs events
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    
    // Extract required fields
    const {
      workspace_id,
      email,
      complaint_type = 'spam', // 'spam', 'phishing', etc.
      feedback,
      campaign_id,
      send_id,
      provider,
      raw_payload
    } = body;

    if (!workspace_id || !email) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: workspace_id, email" },
        { status: 400 }
      );
    }

    // Process complaint using Safety Net function
    const { data: complaintId, error } = await supabase.rpc('process_complaint', {
      p_workspace_id: workspace_id,
      p_email: email,
      p_complaint_type: complaint_type,
      p_feedback: feedback || null,
      p_campaign_id: campaign_id || null,
      p_send_id: send_id || null,
      p_provider: provider || null,
      p_raw_payload: raw_payload || {}
    });

    if (error) {
      console.error('Error processing complaint:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      complaint_id: complaintId,
      message: 'Spam complaint processed and contact auto-suppressed'
    });
  } catch (error: any) {
    console.error('Complaint endpoint error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















































