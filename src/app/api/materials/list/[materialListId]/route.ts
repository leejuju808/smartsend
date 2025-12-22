// Block 223000 — Material List Generator + Supplier Order Integration
// GET /api/materials/list/[materialListId]
// Get material list with items

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ materialListId: string }> }
) {
  try {
    const { materialListId } = await params;
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get material list
    const { data: materialList, error: listError } = await supabase
      .from("material_lists")
      .select(`
        id,
        job_id,
        estimate_id,
        status,
        notes,
        created_at
      `)
      .eq("id", materialListId)
      .single();

    if (listError || !materialList) {
      return NextResponse.json(
        { error: "Material list not found" },
        { status: 404 }
      );
    }

    // Get material list items
    const { data: items, error: itemsError } = await supabase
      .from("material_list_items")
      .select(`
        id,
        material_id,
        description,
        quantity,
        unit,
        waste_factor,
        supplier_id
      `)
      .eq("material_list_id", materialListId)
      .order("created_at", { ascending: true });

    if (itemsError) {
      return NextResponse.json(
        { error: "Failed to load items" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      material_list: materialList,
      items: items || [],
    });
  } catch (error: any) {
    console.error("Error in get material list route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























