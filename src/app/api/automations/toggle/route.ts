// Block 232000 — Automation Engine API
// POST /api/automations/toggle - Toggle automation active status

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }

    // Get current status
    const { data: automation, error: fetchError } = await supabase
      .from("automations")
      .select("id, active")
      .eq("id", id)
      .eq("roofing_company_id", companyId)
      .single();

    if (fetchError || !automation) {
      return NextResponse.json(
        { error: "Automation not found" },
        { status: 404 }
      );
    }

    // Toggle active status
    const { data: updated, error: updateError } = await supabase
      .from("automations")
      .update({ active: !automation.active })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("[Automations] Toggle error:", updateError);
      return NextResponse.json(
        { error: "Failed to toggle automation" },
        { status: 500 }
      );
    }

    return NextResponse.json({ automation: updated });
  } catch (error: any) {
    console.error("[Automations] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























