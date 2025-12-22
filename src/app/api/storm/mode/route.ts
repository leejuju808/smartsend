// Block 40210 — Storm Mode Toggle API
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { workspace_id, active, settings } = await req.json();

    if (!workspace_id) {
      return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
    }

    // Verify workspace membership
    const { data: member } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Not a workspace member" }, { status: 403 });
    }

    // Upsert storm flag
    const { data: stormFlag, error: flagError } = await supabase
      .from("storm_flags")
      .upsert(
        {
          workspace_id,
          active: active ?? true,
          last_triggered: active ? new Date().toISOString() : null,
          auto_respond_enabled: settings?.auto_respond_enabled ?? true,
          auto_classify_enabled: settings?.auto_classify_enabled ?? true,
          auto_schedule_enabled: settings?.auto_schedule_enabled ?? true,
          storm_outreach_enabled: settings?.storm_outreach_enabled ?? true,
          auto_off_threshold_hours: settings?.auto_off_threshold_hours ?? 72,
        },
        {
          onConflict: "workspace_id",
        }
      )
      .select()
      .single();

    if (flagError) {
      console.error("Error updating storm flag:", flagError);
      return NextResponse.json(
        { error: "Failed to update storm mode" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, storm_flag: stormFlag });
  } catch (error: any) {
    console.error("Error in POST /api/storm/mode:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const url = new URL(req.url);
    const workspace_id = url.searchParams.get("workspace_id");

    if (!workspace_id) {
      return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
    }

    // Get storm flag
    const { data: stormFlag, error: flagError } = await supabase
      .from("storm_flags")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    if (flagError && flagError.code !== "PGRST116") {
      // PGRST116 = not found, which is fine (means storm mode is off)
      console.error("Error fetching storm flag:", flagError);
      return NextResponse.json(
        { error: "Failed to fetch storm mode" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      storm_flag: stormFlag || {
        workspace_id,
        active: false,
        auto_respond_enabled: true,
        auto_classify_enabled: true,
        auto_schedule_enabled: true,
        storm_outreach_enabled: true,
        auto_off_threshold_hours: 72,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/storm/mode:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































