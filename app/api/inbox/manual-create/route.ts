// Block 20180 — Manual Inbox Conversation Create

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get active workspace ID
    const workspaceId = await getActiveWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID required" },
        { status: 400 }
      );
    }

    // Get a campaign ID for this workspace (required for inbox_threads)
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("workspace_id", workspaceId)
      .limit(1)
      .maybeSingle();

    if (campaignsError || !campaigns) {
      return NextResponse.json(
        { error: "No campaign found. Please create a campaign first." },
        { status: 400 }
      );
    }

    const {
      homeowner_name,
      homeowner_email,
      homeowner_phone,
      property_address,
      initial_note,
      estimated_job_value,
      lead_stage,
      assigned_to_user_id,
    } = await req.json();

    if (!homeowner_name && !homeowner_email && !homeowner_phone) {
      return NextResponse.json(
        { error: "At least name, email, or phone is required" },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    // Create the inbox thread (conversation)
    const insertPayload: any = {
      campaign_id: campaigns.id,
      homeowner_name: homeowner_name || null,
      homeowner_email: homeowner_email || null,
      homeowner_phone: homeowner_phone || null,
      property_address: property_address || null,
      lead_stage: lead_stage || "new",
      engagement_level: "warm",
      engagement_score: 30, // phone leads are stronger than pure cold click
      thread_estimated_value: estimated_job_value || null,
      lead_source: "phone",
      created_channel: "manual",
      created_by_user_id: user.id,
      assigned_to_user_id: assigned_to_user_id || null,
      last_contact_method: "phone",
      last_contact_at: nowIso,
      next_action_at: null,
      internal_notes: initial_note || null,
      status: "open",
      last_message_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { data: thread, error } = await supabase
      .from("inbox_threads")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("Manual conversation create error", error);
      return NextResponse.json(
        { error: "Failed to create lead: " + error.message },
        { status: 500 }
      );
    }

    // Optional: log an activity + note
    if (initial_note) {
      await supabase.from("inbox_activity_log").insert({
        thread_id: thread.id,
        campaign_id: campaigns.id,
        user_id: user.id,
        type: "note",
        title: "Initial phone call / walk-in note",
        body: initial_note,
      });
    }

    return NextResponse.json({ conversation: thread });
  } catch (error: any) {
    console.error("Error in manual-create API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

