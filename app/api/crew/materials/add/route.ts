// Block 42000 — SmartSend Roofing Crew App v1
// API Route: Add Material Usage
// POST /api/crew/materials/add

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { job_id, member_id, material_name, quantity, unit } = body;

    if (!job_id || !member_id || !material_name || !quantity) {
      return NextResponse.json(
        { error: "job_id, member_id, material_name, and quantity are required" },
        { status: 400 }
      );
    }

    // Verify job exists
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Insert material usage
    const { data: materialUsage, error: materialError } = await supabase
      .from("material_usage")
      .insert({
        job_id,
        member_id,
        material_name,
        quantity: parseFloat(quantity),
        unit: unit || "each",
      })
      .select()
      .single();

    if (materialError) {
      console.error("Error creating material usage:", materialError);
      return NextResponse.json(
        { error: "Failed to record material usage", details: materialError.message },
        { status: 500 }
      );
    }

    // Log activity
    await supabase
      .from("job_activity_log")
      .insert({
        job_id,
        member_id,
        type: "material",
        payload: {
          material_name,
          quantity: parseFloat(quantity),
          unit: unit || "each",
        },
      });

    // Block 48000: Auto-deduct from inventory
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

      await fetch(`${supabaseUrl}/functions/v1/inventory-update-from-crew-usage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          job_id,
          material_name,
          quantity: parseFloat(quantity),
          unit: unit || "each",
        }),
      });
    } catch (inventoryError) {
      // Log but don't fail - inventory update is best effort
      console.error("Error updating inventory from crew usage:", inventoryError);
    }

    return NextResponse.json({
      success: true,
      material_usage: materialUsage,
      message: "Material usage recorded successfully",
    });
  } catch (error: any) {
    console.error("Error in add material API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































