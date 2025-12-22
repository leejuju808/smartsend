// Block 232000 — Automation Engine API
// GET /api/automations/list - List all automations for current company

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json(
        { error: "No roofing company found" },
        { status: 404 }
      );
    }

    // Get all automations with their actions
    const { data: automations, error } = await supabase
      .from("automations")
      .select(`
        *,
        automation_actions (
          id,
          action_type,
          action_payload,
          sort_order
        )
      `)
      .eq("roofing_company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Automations] Fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch automations" },
        { status: 500 }
      );
    }

    return NextResponse.json({ automations: automations || [] });
  } catch (error: any) {
    console.error("[Automations] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























