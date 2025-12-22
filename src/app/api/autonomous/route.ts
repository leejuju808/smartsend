import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/autonomous
 * Fetch autonomous actions for the current user's org
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's org_id from profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (!profile?.org_id) {
      return NextResponse.json({ error: "No org found" }, { status: 404 });
    }

    // Fetch autonomous actions for this org (not yet executed)
    const { data: actions, error } = await supabaseAdmin
      .from("autonomous_actions")
      .select("*")
      .eq("org_id", profile.org_id)
      .eq("executed", false)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching autonomous actions:", error);
      return NextResponse.json({ error: "Failed to fetch actions" }, { status: 500 });
    }

    return NextResponse.json(actions || []);
  } catch (error) {
    console.error("Error in autonomous GET:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

