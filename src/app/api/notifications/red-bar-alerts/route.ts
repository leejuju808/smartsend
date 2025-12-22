/**
 * GET /api/notifications/red-bar-alerts
 * Get unresolved owner red bar alerts
 * 
 * POST /api/notifications/red-bar-alerts/[id]/resolve
 * Resolve a red bar alert
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Get unresolved red bar alerts for owner
    const { data: alerts, error } = await supabase
      .from("owner_red_bar_alerts")
      .select("*")
      .eq("org_id", orgId)
      .eq("owner_user_id", user.id)
      .eq("is_resolved", false)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: alerts || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































