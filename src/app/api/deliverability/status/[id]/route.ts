// Block 20930 — Deliverability Status API
// Returns comprehensive deliverability status for a domain

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const domainSettingsId = params.id;

    // Get deliverability status using database function
    const { data: status, error } = await supabase.rpc(
      "get_deliverability_status",
      { p_domain_settings_id: domainSettingsId }
    );

    if (error) {
      console.error("Error getting deliverability status:", error);
      return NextResponse.json(
        { error: error.message || "Failed to get deliverability status" },
        { status: 500 }
      );
    }

    // Verify user has access to this domain
    const { data: domainSettings } = await supabase
      .from("domain_settings")
      .select("org_id")
      .eq("id", domainSettingsId)
      .single();

    if (!domainSettings) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    // Check org membership
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("id")
      .eq("org_id", domainSettings.org_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (error: any) {
    console.error("Deliverability status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get deliverability status" },
      { status: 500 }
    );
  }
}
















































