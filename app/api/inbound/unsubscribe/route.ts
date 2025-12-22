import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/inbound/unsubscribe
 * 
 * SmartSend Safety Net v1 - Unsubscribe Handler
 * Processes unsubscribe requests, auto-suppresses contacts globally, and logs events
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
      unsubscribe_method = 'link', // 'link', 'reply', 'manual', 'webhook'
      reason,
      campaign_id,
      send_id,
      ip_address,
      user_agent,
      raw_payload
    } = body;

    if (!workspace_id || !email) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: workspace_id, email" },
        { status: 400 }
      );
    }

    // Process unsubscribe using Safety Net function
    const { data: unsubscribeId, error } = await supabase.rpc('process_unsubscribe', {
      p_workspace_id: workspace_id,
      p_email: email,
      p_unsubscribe_method: unsubscribe_method,
      p_reason: reason || null,
      p_campaign_id: campaign_id || null,
      p_send_id: send_id || null,
      p_ip_address: ip_address || null,
      p_user_agent: user_agent || null,
      p_raw_payload: raw_payload || {}
    });

    if (error) {
      console.error('Error processing unsubscribe:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      unsubscribe_id: unsubscribeId,
      message: 'Unsubscribe processed and contact auto-suppressed globally'
    });
  } catch (error: any) {
    console.error('Unsubscribe endpoint error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















































