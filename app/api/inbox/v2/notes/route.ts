// Block 13300 — SmartSend Inbox v2 API
// POST /api/inbox/v2/notes
// Add a note to a lead

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { lead_id, body, campaign_id } = await req.json();

  if (!lead_id || !body) {
    return NextResponse.json(
      { error: "lead_id and body required" },
      { status: 400 }
    );
  }

  // Get thread to find campaign_id if not provided
  let finalCampaignId = campaign_id;
  if (!finalCampaignId) {
    const { data: thread } = await supabase
      .from("reply_threads")
      .select("campaign_id")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    
    finalCampaignId = thread?.campaign_id;
  }

  // Insert note into lead_notes table
  const noteData: any = {
    lead_id,
    author_user_id: user.id,
    body: body.trim(),
    is_internal: true,
    created_at: new Date().toISOString(),
  };

  // Add campaign_id if available
  if (finalCampaignId) {
    noteData.campaign_id = finalCampaignId;
  }

  const { data: note, error: noteError } = await supabase
    .from("lead_notes")
    .insert(noteData)
    .select()
    .single();

  if (noteError) {
    console.error("Add note error:", noteError);
    return NextResponse.json({ error: "Failed to add note" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    note: {
      id: note.id,
      body: note.body,
      created_at: note.created_at,
      author_user_id: note.author_user_id,
    },
  });
}





















































