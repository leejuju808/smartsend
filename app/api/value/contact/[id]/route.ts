// Block 18600 — SmartSend Roof Value Estimator v1
// GET /api/value/contact/{id} - Retrieve roof value estimates for a contact

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contactId = params.id;

    // Fetch roof value summary from view
    const { data: summary, error: summaryError } = await supabase
      .from("roof_value_summary")
      .select("*")
      .eq("contact_id", contactId)
      .single();

    if (summaryError && summaryError.code !== "PGRST116") {
      console.error("Error fetching roof value summary:", summaryError);
      return NextResponse.json(
        { error: "Failed to fetch roof value summary" },
        { status: 500 }
      );
    }

    // Fetch individual estimates if summary doesn't exist or for detailed view
    const [
      { data: roofSize },
      { data: repairCost },
      { data: replacementCost },
      { data: insuranceScore },
      { data: stormDamage },
      { data: leadValue }
    ] = await Promise.all([
      supabase
        .from("roof_size_estimates")
        .select("*")
        .eq("contact_id", contactId)
        .single(),
      supabase
        .from("repair_cost_estimates")
        .select("*")
        .eq("contact_id", contactId)
        .single(),
      supabase
        .from("replacement_cost_estimates")
        .select("*")
        .eq("contact_id", contactId)
        .single(),
      supabase
        .from("insurance_value_scores")
        .select("*")
        .eq("contact_id", contactId)
        .single(),
      supabase
        .from("storm_damage_value_estimates")
        .select("*")
        .eq("contact_id", contactId)
        .single(),
      supabase
        .from("lead_value_scores")
        .select("*")
        .eq("contact_id", contactId)
        .single()
    ]);

    // Combine all estimates
    const estimates = {
      roofSize: roofSize || null,
      repairCost: repairCost || null,
      replacementCost: replacementCost || null,
      insuranceScore: insuranceScore || null,
      stormDamage: stormDamage || null,
      leadValue: leadValue || null,
      summary: summary || null
    };

    return NextResponse.json({ estimates });
  } catch (error: any) {
    console.error("Error in GET /api/value/contact/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































