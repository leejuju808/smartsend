import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      org_id,
      sequence_id,
      autopilot_mode_override,
      aggressiveness_override,
      max_autopilot_emails_per_lead_override,
      min_minutes_between_autopilot_override,
      auto_send_ready_to_meet_override,
      auto_send_needs_info_override,
      auto_send_follow_up_later_override,
      auto_send_open_to_chat_override,
    } = body;

    if (!org_id || !sequence_id) {
      return NextResponse.json(
        { error: "org_id and sequence_id are required" },
        { status: 400 }
      );
    }

    // Verify user is a member of the org
    const { data: membership, error: membershipError } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 }
      );
    }

    // Only admins and members can update settings
    if (membership.role !== "admin" && membership.role !== "member") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Upsert override
    const { data, error } = await supabase
      .from("sdr_sequence_overrides")
      .upsert(
        {
          org_id,
          sequence_id,
          autopilot_mode_override,
          aggressiveness_override,
          max_autopilot_emails_per_lead_override,
          min_minutes_between_autopilot_override,
          auto_send_ready_to_meet_override,
          auto_send_needs_info_override,
          auto_send_follow_up_later_override,
          auto_send_open_to_chat_override,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "org_id,sequence_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error upserting sequence override:", error);
      return NextResponse.json(
        { error: error.message || "Failed to save sequence override" },
        { status: 500 }
      );
    }

    return NextResponse.json({ override: data });
  } catch (err: any) {
    console.error("Error in sequence override API:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

