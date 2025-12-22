// Block 94000 — Homeowner Preferences API
// POST /api/homeowner/preferences
// Save/update homeowner communication preferences

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      portal_token,
      job_id,
      prefers_sms,
      prefers_email,
      update_frequency,
      quiet_hours_start,
      quiet_hours_end,
    } = body;

    if (!portal_token || !job_id) {
      return NextResponse.json(
        { error: "portal_token and job_id are required" },
        { status: 400 }
      );
    }

    // Get portal by token
    const { data: portal, error: portalError } = await supabase
      .from("homeowner_portals")
      .select("id, job_id")
      .eq("portal_token", portal_token)
      .eq("is_active", true)
      .single();

    if (portalError || !portal) {
      return NextResponse.json(
        { error: "Invalid portal token" },
        { status: 404 }
      );
    }

    // Upsert preferences
    const { data: preferences, error: prefError } = await supabase
      .from("homeowner_preferences")
      .upsert(
        {
          portal_id: portal.id,
          job_id: job_id,
          prefers_sms: prefers_sms ?? true,
          prefers_email: prefers_email ?? true,
          update_frequency: update_frequency || "normal",
          quiet_hours_start: quiet_hours_start || null,
          quiet_hours_end: quiet_hours_end || null,
        },
        {
          onConflict: "job_id",
        }
      )
      .select()
      .single();

    if (prefError) {
      console.error("Error saving preferences:", prefError);
      return NextResponse.json(
        { error: "Failed to save preferences" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      preferences,
    });
  } catch (error: any) {
    console.error("Error in preferences API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const portal_token = searchParams.get("portal_token");
    const job_id = searchParams.get("job_id");

    if (!portal_token && !job_id) {
      return NextResponse.json(
        { error: "portal_token or job_id is required" },
        { status: 400 }
      );
    }

    let query = supabase.from("homeowner_preferences").select("*");

    if (portal_token) {
      // Get portal first
      const { data: portal } = await supabase
        .from("homeowner_portals")
        .select("id, job_id")
        .eq("portal_token", portal_token)
        .single();

      if (portal) {
        query = query.eq("portal_id", portal.id);
      }
    } else if (job_id) {
      query = query.eq("job_id", job_id);
    }

    const { data: preferences, error } = await query.single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned
      console.error("Error fetching preferences:", error);
      return NextResponse.json(
        { error: "Failed to fetch preferences" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      preferences: preferences || null,
    });
  } catch (error: any) {
    console.error("Error in preferences GET API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
