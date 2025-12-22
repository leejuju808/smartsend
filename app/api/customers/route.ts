// Block 254400 — SmartSend Lifetime Value Engine v1
// API Route: Customers
// GET /api/customers - List customers
// POST /api/customers - Create customer

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const team_id = searchParams.get("team_id");
    const search = searchParams.get("search");
    const engagement_status = searchParams.get("engagement_status");
    const warranty_expiring_soon = searchParams.get("warranty_expiring_soon");
    const maintenance_due_soon = searchParams.get("maintenance_due_soon");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    if (!team_id) {
      return NextResponse.json(
        { error: "team_id is required" },
        { status: 400 }
      );
    }

    // Verify user is team member
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", team_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Build query
    let query = supabase
      .from("customers")
      .select(`
        *,
        customer_jobs (
          id,
          job_id,
          roofing_job_id,
          job_type,
          job_value,
          job_status,
          job_completed_date
        )
      `)
      .eq("team_id", team_id)
      .order("lifetime_value", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,address.ilike.%${search}%`
      );
    }

    if (engagement_status) {
      query = query.eq("engagement_status", engagement_status);
    }

    if (warranty_expiring_soon === "true") {
      query = query.eq("warranty_expiring_soon", true);
    }

    if (maintenance_due_soon === "true") {
      query = query.lte("next_maintenance_due", new Date().toISOString().split("T")[0]);
    }

    const { data: customers, error } = await query;

    if (error) {
      console.error("Error fetching customers:", error);
      return NextResponse.json(
        { error: "Failed to fetch customers" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      customers: customers || [],
      pagination: {
        limit,
        offset,
        count: customers?.length || 0,
      },
    });
  } catch (error: any) {
    console.error("Error in customers API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      team_id,
      name,
      email,
      phone,
      address,
      company_id,
      roof_install_date,
      roof_material,
    } = body;

    if (!team_id) {
      return NextResponse.json(
        { error: "team_id is required" },
        { status: 400 }
      );
    }

    // Verify user is team member
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", team_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Use find_or_create_customer function
    const { data: customer_id, error } = await supabase.rpc(
      "find_or_create_customer",
      {
        p_team_id: team_id,
        p_name: name,
        p_email: email,
        p_phone: phone,
        p_address: address,
        p_company_id: company_id,
      }
    );

    if (error) {
      console.error("Error creating customer:", error);
      return NextResponse.json(
        { error: "Failed to create customer" },
        { status: 500 }
      );
    }

    // Update additional fields if provided
    if (roof_install_date || roof_material) {
      const updateData: any = {};
      if (roof_install_date) updateData.roof_install_date = roof_install_date;
      if (roof_material) updateData.roof_material = roof_material;

      await supabase
        .from("customers")
        .update(updateData)
        .eq("id", customer_id);
    }

    // Fetch created customer
    const { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customer_id)
      .single();

    return NextResponse.json({
      ok: true,
      customer,
    });
  } catch (error: any) {
    console.error("Error in customers API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















