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
    const { org_id, ...settings } = body;

    if (!org_id) {
      return NextResponse.json(
        { error: "org_id is required" },
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

    // Upsert settings
    const { data, error } = await supabase
      .from("sdr_settings")
      .upsert(
        {
          org_id,
          ...settings,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "org_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error upserting SDR settings:", error);
      return NextResponse.json(
        { error: error.message || "Failed to save settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error in SDR settings API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

