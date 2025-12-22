import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; leadId: string }> }
) {
  try {
    const { id: campaignId, leadId } = await params;

    // Update enrollment to active
    const { error } = await supabase
      .from("sequence_enrollments")
      .update({
        status: "active",
        paused_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

