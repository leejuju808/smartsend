/**
 * POST /api/notifications/red-bar-alerts/[id]/resolve
 * Resolve a red bar alert
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const alertId = params.id;

    // Resolve the alert
    const { data: alert, error } = await supabase
      .from("owner_red_bar_alerts")
      .update({
        is_resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", alertId)
      .eq("org_id", orgId)
      .eq("owner_user_id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    return NextResponse.json({ data: alert });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































