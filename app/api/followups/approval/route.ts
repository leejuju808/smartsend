// app/api/followups/approval/route.ts
// Block 186: Approval UI for auto-generated follow-ups

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// GET: Fetch all pending follow-ups awaiting approval
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: queue, error } = await supabase
    .from("send_queue")
    .select(`
      id,
      campaign_id,
      lead_id,
      payload,
      created_at,
      campaigns(name),
      leads(name, email)
    `)
    .eq("step_number", 999)
    .eq("status", "waiting_approval")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: queue || [] });
}

// POST: Approve or reject a follow-up
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { queueId, action } = body; // action: "approve" | "reject"

  if (!queueId || !action) {
    return NextResponse.json(
      { error: "queueId and action are required" },
      { status: 400 }
    );
  }

  if (action === "approve") {
    const { error } = await supabase
      .from("send_queue")
      .update({ status: "pending" })
      .eq("id", queueId)
      .eq("step_number", 999)
      .eq("status", "waiting_approval");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, action: "approved" });
  } else if (action === "reject") {
    const { error } = await supabase
      .from("send_queue")
      .delete()
      .eq("id", queueId)
      .eq("step_number", 999)
      .eq("status", "waiting_approval");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, action: "rejected" });
  } else {
    return NextResponse.json(
      { error: "Invalid action. Use 'approve' or 'reject'" },
      { status: 400 }
    );
  }
}












