// Block 241000 — SmartSend Roofing Supplier Hub v1
// API Routes: GET /api/suppliers, POST /api/suppliers
// 
// Manage suppliers (list and create)

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
    const workspace_id = searchParams.get("workspace_id"); // Legacy support

    if (!company_id && !workspace_id) {
      return NextResponse.json(
        { error: "company_id or workspace_id is required" },
        { status: 400 }
      );
    }

    // Build query with RLS (suppliers table should have RLS enabled)
    let query = supabase
      .from("suppliers")
      .select(`
        *,
        po_count:public.get_supplier_po_count(id)
      `);

    if (company_id) {
      query = query.eq("company_id", company_id);
    } else if (workspace_id) {
      query = query.eq("workspace_id", workspace_id);
    }

    const { data: suppliers, error } = await query
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Suppliers fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch suppliers" },
        { status: 500 }
      );
    }

    return NextResponse.json({ suppliers: suppliers || [] });
  } catch (error: any) {
    console.error("Error in GET /api/suppliers:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const {
      company_id,
      workspace_id, // Legacy support
      name,
      email,
      phone,
      address,
      delivery_hours,
      delivery_cutoff,
      delivery_instructions,
      lead_time_days,
      account_number,
      notes,
    } = body;

    const finalCompanyId = company_id || workspace_id;
    
    if (!finalCompanyId || !name || !email) {
      return NextResponse.json(
        { error: "company_id (or workspace_id), name, and email are required" },
        { status: 400 }
      );
    }

    const { data: supplier, error } = await supabase
      .from("suppliers")
      .insert({
        company_id: finalCompanyId,
        workspace_id: workspace_id || null, // Keep for backward compatibility
        name,
        email,
        phone: phone || null,
        address: address || null,
        delivery_hours: delivery_hours || null,
        delivery_cutoff: delivery_cutoff || null,
        delivery_instructions: delivery_instructions || null,
        lead_time_days: lead_time_days || 2,
        account_number: account_number || null,
        notes: notes || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Supplier creation error:", error);
      return NextResponse.json(
        { error: "Failed to create supplier" },
        { status: 500 }
      );
    }

    return NextResponse.json({ supplier });
  } catch (error: any) {
    console.error("Error in POST /api/suppliers:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






