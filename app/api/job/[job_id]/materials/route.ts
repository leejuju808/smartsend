// Block 27880 — SmartSend Roofing Crew Mobile Field App v1
// API Route: Get job materials list
// GET /api/job/[job_id]/materials

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get material order items
    const { data: order } = await supabase
      .from("material_orders")
      .select("id")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let items: any[] = [];
    if (order?.id) {
      const { data: orderItems } = await supabase
        .from("material_order_items")
        .select("*")
        .eq("material_order_id", order.id);
      items = orderItems || [];
    }

    // Also check auto_calculated_materials
    const { data: autoMaterials } = await supabase
      .from("auto_calculated_materials")
      .select("*")
      .eq("job_id", job_id);

    // Combine and format materials
    const allMaterials = [
      ...items.map((item) => ({
        id: item.id,
        description: item.description || item.material_type || "Material",
        quantity: item.quantity || 0,
        unit: item.unit || "units",
        is_ordered: item.is_ordered !== undefined ? item.is_ordered : true,
      })),
      ...(autoMaterials || []).map((mat) => ({
        id: mat.id,
        description: mat.material_type || "Material",
        quantity: mat.quantity || 0,
        unit: mat.unit || "units",
        is_ordered: mat.is_ordered || false,
      })),
    ];

    return NextResponse.json({ items: allMaterials });
  } catch (error: any) {
    console.error("Error in job materials API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
