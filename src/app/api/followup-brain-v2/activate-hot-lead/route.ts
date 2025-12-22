// Block 24900 — Follow-Up Brain v2: Activate Hot Lead API Route

import { NextRequest, NextResponse } from "next/server";
import { activateHotLead } from "@/lib/followup-brain-v2/hot-lead-activation";
import { supabaseAdmin } from "@/server/supabase";

export async function POST(req: NextRequest) {
  try {
    const { lead_id, detection_id, trigger } = await req.json();

    if (!lead_id) {
      return NextResponse.json(
        { error: "lead_id is required" },
        { status: 400 }
      );
    }

    // Get detection_id if not provided
    let finalDetectionId = detection_id;
    if (!finalDetectionId) {
      const { data: latestDetection } = await supabaseAdmin
        .from('followup_nlp_detections')
        .select('id')
        .eq('lead_id', lead_id)
        .eq('detection_type', 'hot_lead')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      finalDetectionId = latestDetection?.id;
    }

    const activationTrigger = trigger || 'manual_activation';

    const result = await activateHotLead(
      lead_id,
      finalDetectionId || '',
      activationTrigger
    );

    return NextResponse.json({
      ok: result.activated,
      ...result,
    });
  } catch (error: any) {
    console.error('Error activating hot lead:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






































