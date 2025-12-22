// app/api/leads/[id]/classification/route.ts
// Block 11500 — Get lead classification for revenue estimator
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id } = await params;
  const leadId = id;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    // Get lead's latest classification from lead_intents
    const { data: latestIntent } = await supabase
      .from("lead_intents")
      .select("classification")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fallback: get classification from leads table
    const { data: lead } = await supabase
      .from("leads")
      .select("classification")
      .eq("id", leadId)
      .maybeSingle();

    const classification = latestIntent?.classification || lead?.classification || "NEW";

    return NextResponse.json({
      classification,
      latest_intent: latestIntent?.classification || null,
      lead_classification: lead?.classification || null,
    });
  } catch (error) {
    console.error("Error fetching lead classification:", error);
    return NextResponse.json(
      { error: "Failed to fetch classification" },
      { status: 500 }
    );
  }
}























































