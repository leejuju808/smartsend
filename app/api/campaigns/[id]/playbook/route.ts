import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ai_sdr_playbook_id } = await req.json();

    // Verify campaign belongs to user
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, user_id")
      .eq("id", params.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Verify playbook belongs to user if provided
    if (ai_sdr_playbook_id) {
      const { data: playbook, error: playbookError } = await supabase
        .from("ai_sdr_playbooks")
        .select("id, user_id")
        .eq("id", ai_sdr_playbook_id)
        .single();

      if (playbookError || !playbook) {
        return NextResponse.json(
          { error: "Playbook not found" },
          { status: 404 }
        );
      }

      if (playbook.user_id !== user.id) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 403 }
        );
      }
    }

    // Update campaign
    const { error: updateError } = await supabase
      .from("campaigns")
      .update({ ai_sdr_playbook_id: ai_sdr_playbook_id || null })
      .eq("id", params.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating campaign playbook:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


