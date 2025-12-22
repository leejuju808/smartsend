// Block 20050 — Lead Status Update Endpoint

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    const body = await req.json();
    const {
      conversation_id,
      lead_stage,
      next_action_at,
      last_contact_method,
      log_contact,
      assigned_to_user_id,
    } = body;

    if (!conversation_id) {
      return NextResponse.json(
        { error: "conversation_id is required" },
        { status: 400 }
      );
    }

    const patch: any = {};
    if (lead_stage !== undefined) patch.lead_stage = lead_stage;
    if (next_action_at !== undefined) patch.next_action_at = next_action_at;
    if (assigned_to_user_id !== undefined)
      patch.assigned_to_user_id = assigned_to_user_id;

    if (log_contact) {
      patch.last_contact_method = last_contact_method ?? "phone";
      patch.last_contact_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("inbox_threads")
      .update(patch)
      .eq("id", conversation_id)
      .select()
      .single();

    if (error) {
      console.error("Lead update error", error);
      return NextResponse.json(
        { error: "Failed to update lead" },
        { status: 500 }
      );
    }

    return NextResponse.json({ conversation: data });
  } catch (error: any) {
    console.error("Error in /api/inbox/lead/update:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

















































