// GET /api/materials/job/[jobId] - Get all material data for a job (items, delivery, verification, status)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { jobId } = await params;

    // Get all material items
    const { data: items, error: itemsError } = await supabase
      .from("material_items")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (itemsError) {
      console.error("Error fetching material items:", itemsError);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // Get delivery records
    const { data: deliveries, error: deliveriesError } = await supabase
      .from("material_delivery_records")
      .select(`
        *,
        workforce_employees:employee_id (
          id,
          first_name,
          last_name
        )
      `)
      .eq("job_id", jobId)
      .order("delivered_at", { ascending: false });

    if (deliveriesError) {
      console.error("Error fetching delivery records:", deliveriesError);
    }

    // Get verification records
    const { data: verifications, error: verificationsError } = await supabase
      .from("material_verification")
      .select(`
        *,
        material_items:material_item_id (
          id,
          name,
          quantity_expected,
          unit
        ),
        workforce_employees:verified_by (
          id,
          first_name,
          last_name
        )
      `)
      .eq("job_id", jobId)
      .order("verified_at", { ascending: false });

    if (verificationsError) {
      console.error("Error fetching verification records:", verificationsError);
    }

    // Get approval status
    const { data: approval, error: approvalError } = await supabase
      .from("material_verification_approval")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (approvalError && approvalError.code !== "PGRST116") {
      // PGRST116 = no rows returned, which is fine
      console.error("Error fetching approval:", approvalError);
    }

    // Calculate material health and risk score
    const totalItems = items?.length || 0;
    const matchedItems = verifications?.filter((v) => v.status === "matched").length || 0;
    const shortages = verifications?.filter((v) => v.status === "shortage").length || 0;
    const wrongMaterials = verifications?.filter((v) => v.status === "wrong_material").length || 0;

    const healthPercentage = totalItems > 0 ? Math.round((matchedItems / totalItems) * 100) : 100;
    const riskScore = (shortages * 10) + (wrongMaterials * 15);

    return NextResponse.json({
      items: items || [],
      deliveries: deliveries || [],
      verifications: verifications || [],
      approval: approval || null,
      summary: {
        total_items: totalItems,
        matched_items: matchedItems,
        shortages,
        wrong_materials: wrongMaterials,
        health_percentage: healthPercentage,
        risk_score: riskScore,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/materials/job/[jobId]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























