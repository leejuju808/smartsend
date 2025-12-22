// Block 94000 — Homeowner Feedback API
// POST /api/homeowner/feedback
// Submit micro-feedback events (NPS-style ratings)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { portal_token, job_id, trigger_type, rating, comment } = body;

    if (!portal_token || !job_id || !trigger_type || !rating) {
      return NextResponse.json(
        { error: "portal_token, job_id, trigger_type, and rating are required" },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 10) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 10" },
        { status: 400 }
      );
    }

    // Get portal by token
    const { data: portal, error: portalError } = await supabase
      .from("homeowner_portals")
      .select("id, job_id, workspace_id")
      .eq("portal_token", portal_token)
      .eq("is_active", true)
      .single();

    if (portalError || !portal) {
      return NextResponse.json(
        { error: "Invalid portal token" },
        { status: 404 }
      );
    }

    // Insert feedback event
    const { data: feedback, error: feedbackError } = await supabase
      .from("experience_feedback_events")
      .insert({
        portal_id: portal.id,
        job_id: job_id,
        trigger_type: trigger_type,
        rating: rating,
        comment: comment || null,
      })
      .select()
      .single();

    if (feedbackError) {
      console.error("Error saving feedback:", feedbackError);
      return NextResponse.json(
        { error: "Failed to save feedback" },
        { status: 500 }
      );
    }

    // Auto-flagging: Promoters (9-10) and At-Risk (≤6) are handled by generated columns
    // But we can trigger actions here if needed

    // If promoter (9-10), we could trigger review/referral engine (84000)
    if (rating >= 9 && portal.workspace_id) {
      // This would integrate with block 84000 review engine
      // For now, just log it
      console.log(`Promoter detected for job ${job_id}, rating: ${rating}`);
    }

    // If at-risk (≤6), notify owner
    if (rating <= 6 && portal.workspace_id) {
      // This would integrate with notification system
      // For now, just log it
      console.log(`At-risk feedback for job ${job_id}, rating: ${rating}`);
    }

    return NextResponse.json({
      success: true,
      feedback,
    });
  } catch (error: any) {
    console.error("Error in feedback API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const portal_token = searchParams.get("portal_token");
    const job_id = searchParams.get("job_id");
    const trigger_type = searchParams.get("trigger_type");

    if (!portal_token && !job_id) {
      return NextResponse.json(
        { error: "portal_token or job_id is required" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("experience_feedback_events")
      .select("*")
      .order("created_at", { ascending: false });

    if (portal_token) {
      const { data: portal } = await supabase
        .from("homeowner_portals")
        .select("id")
        .eq("portal_token", portal_token)
        .single();

      if (portal) {
        query = query.eq("portal_id", portal.id);
      }
    } else if (job_id) {
      query = query.eq("job_id", job_id);
    }

    if (trigger_type) {
      query = query.eq("trigger_type", trigger_type);
    }

    const { data: feedback, error } = await query;

    if (error) {
      console.error("Error fetching feedback:", error);
      return NextResponse.json(
        { error: "Failed to fetch feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      feedback: feedback || [],
    });
  } catch (error: any) {
    console.error("Error in feedback GET API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
