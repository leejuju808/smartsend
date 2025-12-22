import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/inbound/bounce
 * 
 * SmartSend Safety Net v1 - Bounce Event Handler
 * Processes hard and soft bounces, auto-suppresses contacts, and logs events
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
      bounce_type, // 'hard' | 'soft'
      bounce_reason,
      smtp_code,
      dsn_code,
      campaign_id,
      send_id,
      provider,
      raw_payload
    } = body;

    if (!workspace_id || !email || !bounce_type) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: workspace_id, email, bounce_type" },
        { status: 400 }
      );
    }

    if (!['hard', 'soft'].includes(bounce_type)) {
      return NextResponse.json(
        { ok: false, error: "bounce_type must be 'hard' or 'soft'" },
        { status: 400 }
      );
    }

    // Process bounce using Safety Net function
    let bounceId: string;
    
    if (bounce_type === 'hard') {
      const { data, error } = await supabase.rpc('process_hard_bounce', {
        p_workspace_id: workspace_id,
        p_email: email,
        p_bounce_reason: bounce_reason || null,
        p_smtp_code: smtp_code || null,
        p_campaign_id: campaign_id || null,
        p_send_id: send_id || null,
        p_provider: provider || null,
        p_raw_payload: raw_payload || {}
      });

      if (error) {
        console.error('Error processing hard bounce:', error);
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      bounceId = data;
    } else {
      const { data, error } = await supabase.rpc('process_soft_bounce', {
        p_workspace_id: workspace_id,
        p_email: email,
        p_bounce_reason: bounce_reason || null,
        p_smtp_code: smtp_code || null,
        p_campaign_id: campaign_id || null,
        p_send_id: send_id || null,
        p_provider: provider || null,
        p_raw_payload: raw_payload || {}
      });

      if (error) {
        console.error('Error processing soft bounce:', error);
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      bounceId = data;
    }

    return NextResponse.json({
      ok: true,
      bounce_id: bounceId,
      bounce_type,
      message: bounce_type === 'hard' 
        ? 'Hard bounce processed and contact auto-suppressed'
        : 'Soft bounce processed'
    });
  } catch (error: any) {
    console.error('Bounce endpoint error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















































