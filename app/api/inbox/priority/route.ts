// Block 21719 — SmartSend Roofing Priority Queue View v1
// GET /api/inbox/priority
// Returns only hot/warm leads sorted by intent, value, and recency

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional: min value filter via query param
  const { searchParams } = new URL(req.url);
  const minValueParam = searchParams.get("min_value");
  const minValue = minValueParam ? Number(minValueParam) : 0;

  // Get user's workspace
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  const workspaceId = membership?.workspace_id;

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  try {
    // Query inbox_view which has lead_intent, follow_up_stage, follow_up_status, estimated_job_value
    let query = supabase
      .from("inbox_view")
      .select(
        `
        thread_id,
        campaign_id,
        contact_id,
        lead_id,
        workspace_id,
        thread_status,
        last_message_at,
        thread_created_at,
        thread_updated_at,
        first_name,
        last_name,
        contact_email,
        contact_phone,
        contact_name,
        city,
        state,
        contact_address,
        last_message_preview,
        lead_intent,
        follow_up_stage,
        follow_up_status,
        estimated_job_value
      `
      )
      .eq("workspace_id", workspaceId)
      .in("lead_intent", ["hot", "warm"]);
    
    // Only apply min_value filter if explicitly set (and > 0)
    // When minValue is 0, we show all threads regardless of estimated_job_value
    if (minValue > 0) {
      query = query.gte("estimated_job_value", minValue);
    }
    
    query = query
      .order("lead_intent", { ascending: true }) // hot before warm (alphabetically)
      .order("estimated_job_value", { ascending: false, nullsLast: true })
      .order("last_message_at", { ascending: false })
      .limit(100);

    const { data, error } = await query;

    if (error) {
      console.error("Priority inbox error:", error);
      return NextResponse.json(
        { error: "Failed to load priority inbox" },
        { status: 500 }
      );
    }

    // Format threads for frontend
    const formattedThreads = (data || []).map((thread: any) => ({
      id: thread.thread_id,
      subject: thread.last_message_preview
        ? thread.last_message_preview.slice(0, 50) + "..."
        : null,
      last_message_preview: thread.last_message_preview,
      last_message_at: thread.last_message_at,
      contact_id: thread.contact_id,
      contact_first_name: thread.first_name,
      contact_email: thread.contact_email,
      contact_city: thread.city,
      lead_intent: thread.lead_intent,
      follow_up_stage: thread.follow_up_stage,
      follow_up_status: thread.follow_up_status,
      estimated_job_value: thread.estimated_job_value,
    }));

    return NextResponse.json({ data: formattedThreads }, { status: 200 });
  } catch (err: any) {
    console.error("Priority inbox unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}

