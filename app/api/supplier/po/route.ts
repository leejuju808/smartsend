// Block 241000 — SmartSend Roofing Supplier Hub v1
// GET /api/supplier/po?company_id=xxx&job_id=xxx&status=xxx
// List purchase orders with filters

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = req.nextUrl;
    const company_id = searchParams.get("company_id");
    const job_id = searchParams.get("job_id");
    const supplier_id = searchParams.get("supplier_id");
    const status = searchParams.get("status");

    // Build query
    let query = supabase
      .from("purchase_orders")
      .select(`
        *,
        po_items (*),
        suppliers (*),
        jobs:job_id (id, address, homeowner_name),
        deliveries (*),
        material_verification (*),
        supplier_invoices (*)
      `)
      .order("created_at", { ascending: false });

    if (company_id) {
      query = query.eq("company_id", company_id);
    }

    if (job_id) {
      query = query.eq("job_id", job_id);
    }

    if (supplier_id) {
      query = query.eq("supplier_id", supplier_id);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: pos, error } = await query;

    if (error) {
      console.error("POs fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch purchase orders" },
        { status: 500 }
      );
    }

    return NextResponse.json({ purchase_orders: pos || [] });
  } catch (error: any) {
    console.error("Error in GET /api/supplier/po:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























