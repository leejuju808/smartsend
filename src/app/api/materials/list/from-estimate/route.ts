// Block 223000 — Material List Generator + Supplier Order Integration
// POST /api/materials/list/from-estimate
// Generate material list from estimate line items

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, estimate_id } = body;

    if (!job_id || !estimate_id) {
      return NextResponse.json(
        { error: "job_id and estimate_id are required" },
        { status: 400 }
      );
    }

    // Get estimate with line items
    const { data: estimate, error: estimateError } = await supabase
      .from("estimates")
      .select("id, company_id, line_items")
      .eq("id", estimate_id)
      .single();

    if (estimateError || !estimate) {
      return NextResponse.json(
        { error: "Estimate not found" },
        { status: 404 }
      );
    }

    // Verify user has access to company
    const { data: company } = await supabase
      .from("roofing_companies")
      .select("id, owner_id")
      .eq("id", estimate.company_id)
      .single();

    if (!company || company.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Check if material list already exists for this job/estimate
    const { data: existingList } = await supabase
      .from("material_lists")
      .select("id")
      .eq("job_id", job_id)
      .eq("estimate_id", estimate_id)
      .maybeSingle();

    if (existingList) {
      return NextResponse.json({
        material_list_id: existingList.id,
        message: "Material list already exists",
      });
    }

    // Parse line items
    const lineItems = estimate.line_items || [];
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return NextResponse.json(
        { error: "Estimate has no line items" },
        { status: 400 }
      );
    }

    // Create material list
    const { data: materialList, error: listError } = await supabase
      .from("material_lists")
      .insert({
        job_id: job_id,
        estimate_id: estimate_id,
        status: "draft",
        created_by: user.id,
      })
      .select()
      .single();

    if (listError || !materialList) {
      console.error("Error creating material list:", listError);
      return NextResponse.json(
        { error: "Failed to create material list" },
        { status: 500 }
      );
    }

    // Map line items to material list items
    // Simple mapping logic - can be enhanced with AI/material catalog matching
    const materialListItems = lineItems.map((item: any) => {
      // Extract material name from line item
      const materialName = item.material || item.description || item.name || "Unknown Material";
      const quantity = parseFloat(item.quantity) || 1;
      const unit = item.unit || "each";
      
      // Calculate with default 10% waste factor for roofing materials
      const wasteFactor = item.waste_factor || 10.0;
      const adjustedQuantity = quantity * (1 + wasteFactor / 100);

      return {
        material_list_id: materialList.id,
        description: materialName,
        quantity: adjustedQuantity,
        unit: unit,
        waste_factor: wasteFactor,
        // supplier_id will be set later when user assigns suppliers
      };
    });

    // Insert material list items
    const { error: itemsError } = await supabase
      .from("material_list_items")
      .insert(materialListItems);

    if (itemsError) {
      console.error("Error creating material list items:", itemsError);
      // Clean up material list if items fail
      await supabase.from("material_lists").delete().eq("id", materialList.id);
      return NextResponse.json(
        { error: "Failed to create material list items" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      material_list_id: materialList.id,
      message: "Material list created successfully",
    });
  } catch (error: any) {
    console.error("Error in from-estimate route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























