// Block 22126 — SmartSend Roofing Homeowner Transcript v1
// API Route — Fetch transcript messages for a lead

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id } = await params;
  const leadId = id;

  // Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Fetch transcript messages for this lead
  const { data: messages, error } = await supabase
    .from("transcript_messages")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching transcript messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch transcript messages" },
      { status: 500 }
    );
  }

  return NextResponse.json({ messages: messages || [] });
}









































