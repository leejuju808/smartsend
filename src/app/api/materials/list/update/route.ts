// Block 223000 — Material List Generator + Supplier Order Integration
// POST /api/materials/list/update
// Update material list items (add/remove/edit)

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
    const { material_list_id, items, status, notes } = body;

    if (!material_list_id) {
      return NextResponse.json(
        { error: "material_list_id is required" },
        { status: 400 }
      );
    }

    // Get material list and verify access
    const { data: materialList, error: listError } = await supabase
      .from("material_lists")
      .select(`
        id,
        estimate_id,
        estimates!inner(company_id, roofing_companies!inner(owner_id))
      `)
      .eq("id", material_list_id)
      .single();

    if (listError || !materialList) {
      return NextResponse.json(
        { error: "Material list not found" },
        { status: 404 }
      );
    }

    // Verify access (check owner_id from nested query)
    const company = (materialList as any).estimates?.roofing_companies;
    if (!company || company.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Update material list metadata if provided
    const updateData: any = {};
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from("material_lists")
        .update(updateData)
        .eq("id", material_list_id);

      if (updateError) {
        return NextResponse.json(
          { error: "Failed to update material list" },
          { status: 500 }
        );
      }
    }

    // Update items if provided
    if (items && Array.isArray(items)) {
      // Delete existing items
      const { error: deleteError } = await supabase
        .from("material_list_items")
        .delete()
        .eq("material_list_id", material_list_id);

      if (deleteError) {
        return NextResponse.json(
          { error: "Failed to delete existing items" },
          { status: 500 }
        );
      }

      // Insert new items
      const itemsToInsert = items.map((item: any) => ({
        material_list_id: material_list_id,
        material_id: item.material_id || null,
        description: item.description || item.material || "Unknown Material",
        quantity: parseFloat(item.quantity) || 1,
        unit: item.unit || "each",
        waste_factor: parseFloat(item.waste_factor) || 0,
        supplier_id: item.supplier_id || null,
      }));

      const { error: insertError } = await supabase
        .from("material_list_items")
        .insert(itemsToInsert);

      if (insertError) {
        console.error("Error inserting items:", insertError);
        return NextResponse.json(
          { error: "Failed to insert items" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Material list updated successfully",
    });
  } catch (error: any) {
    console.error("Error in update route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























