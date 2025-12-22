// Block 223000 — Material List Generator + Supplier Order Integration
// POST /api/suppliers/orders/create-from-list
// Create supplier orders from material list (grouped by supplier)

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
    const { material_list_id, grouping_rule = "by_supplier" } = body;

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
        job_id,
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

    // Verify access
    const company = (materialList as any).estimates?.roofing_companies;
    if (!company || company.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const companyId = (materialList as any).estimates.company_id;

    // Get material list items
    const { data: listItems, error: itemsError } = await supabase
      .from("material_list_items")
      .select("*")
      .eq("material_list_id", material_list_id);

    if (itemsError || !listItems || listItems.length === 0) {
      return NextResponse.json(
        { error: "Material list has no items" },
        { status: 400 }
      );
    }

    // Group items by supplier_id
    const itemsBySupplier = new Map<string | null, typeof listItems>();
    
    for (const item of listItems) {
      const supplierKey = item.supplier_id || "no_supplier";
      if (!itemsBySupplier.has(supplierKey)) {
        itemsBySupplier.set(supplierKey, []);
      }
      itemsBySupplier.get(supplierKey)!.push(item);
    }

    // Create supplier orders
    const supplierOrderIds: string[] = [];

    for (const [supplierKey, items] of itemsBySupplier.entries()) {
      // Skip items without supplier (user needs to assign supplier first)
      if (supplierKey === "no_supplier") {
        continue;
      }

      const supplierId = supplierKey;

      // Create supplier order
      const { data: supplierOrder, error: orderError } = await supabase
        .from("supplier_orders")
        .insert({
          company_id: companyId,
          job_id: (materialList as any).job_id,
          material_list_id: material_list_id,
          supplier_id: supplierId,
          status: "draft",
        })
        .select()
        .single();

      if (orderError || !supplierOrder) {
        console.error("Error creating supplier order:", orderError);
        continue; // Skip this supplier but continue with others
      }

      // Create supplier order items
      const orderItems = items.map((item) => ({
        supplier_order_id: supplierOrder.id,
        material_id: item.material_id || null,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
      }));

      const { error: orderItemsError } = await supabase
        .from("supplier_order_items")
        .insert(orderItems);

      if (orderItemsError) {
        console.error("Error creating order items:", orderItemsError);
        // Clean up the order if items fail
        await supabase.from("supplier_orders").delete().eq("id", supplierOrder.id);
        continue;
      }

      supplierOrderIds.push(supplierOrder.id);
    }

    if (supplierOrderIds.length === 0) {
      return NextResponse.json(
        { 
          error: "No supplier orders created. Please assign suppliers to material list items first.",
          supplier_order_ids: []
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      supplier_order_ids: supplierOrderIds,
      message: `Created ${supplierOrderIds.length} supplier order(s)`,
    });
  } catch (error: any) {
    console.error("Error in create-from-list route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























