// Block 254400 — SmartSend Lifetime Value Engine v1
// API Route: Customer Details
// GET /api/customers/[id] - Get customer details
// PATCH /api/customers/[id] - Update customer

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get customer with all related data
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select(`
        *,
        customer_jobs (
          id,
          job_id,
          roofing_job_id,
          lead_id,
          job_type,
          job_value,
          job_status,
          job_completed_date,
          created_at
        )
      `)
      .eq("id", params.id)
      .single();

    if (customerError || !customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // Verify user is team member
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", customer.team_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get referrals
    const { data: referrals } = await supabase
      .from("referrals")
      .select("*")
      .eq("customer_id", params.id)
      .order("created_at", { ascending: false });

    // Get customer events
    const { data: events } = await supabase
      .from("customer_events")
      .select("*")
      .eq("customer_id", params.id)
      .order("created_at", { ascending: false })
      .limit(50);

    // Get upsell recommendations
    const { data: upsells } = await supabase
      .from("upsell_recommendations")
      .select("*")
      .eq("customer_id", params.id)
      .order("confidence_score", { ascending: false });

    return NextResponse.json({
      ok: true,
      customer: {
        ...customer,
        referrals: referrals || [],
        events: events || [],
        upsells: upsells || [],
      },
    });
  } catch (error: any) {
    console.error("Error in customer API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get customer to verify access
    const { data: customer } = await supabase
      .from("customers")
      .select("team_id")
      .eq("id", params.id)
      .single();

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // Verify user is team member
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", customer.team_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    // Allow updating specific fields
    const allowedFields = [
      "name",
      "phone",
      "email",
      "address",
      "city",
      "state",
      "zip_code",
      "roof_install_date",
      "roof_material",
      "roof_squares",
      "property_latitude",
      "property_longitude",
      "engagement_status",
      "notes",
      "tags",
      "metadata",
      "maintenance_frequency_days",
      "next_maintenance_due",
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const { data: updatedCustomer, error } = await supabase
      .from("customers")
      .update(updateData)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating customer:", error);
      return NextResponse.json(
        { error: "Failed to update customer" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      customer: updatedCustomer,
    });
  } catch (error: any) {
    console.error("Error in customer API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















