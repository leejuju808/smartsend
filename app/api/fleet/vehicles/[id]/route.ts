// GET /api/fleet/vehicles/[id] - Get vehicle details
// PATCH /api/fleet/vehicles/[id] - Update vehicle
// DELETE /api/fleet/vehicles/[id] - Delete vehicle

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { id } = await params;

    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (error) {
      console.error("Error fetching vehicle:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    // Get full vehicle data with health score and analytics
    const { data: latestMileage } = await supabase
      .from("mileage_logs")
      .select("end_miles, date")
      .eq("vehicle_id", id)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: maintenance } = await supabase
      .from("vehicle_maintenance")
      .select("*")
      .eq("vehicle_id", id)
      .order("next_due_mileage", { ascending: true });

    return NextResponse.json({
      vehicle: {
        ...vehicle,
        current_mileage: latestMileage?.end_miles || 0,
        maintenance_schedule: maintenance || [],
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/fleet/vehicles/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { id } = await params;
    const body = await req.json();

    const { data, error } = await supabase
      .from("vehicles")
      .update(body)
      .eq("id", id)
      .eq("company_id", companyId)
      .select()
      .single();

    if (error) {
      console.error("Error updating vehicle:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    return NextResponse.json({ vehicle: data });
  } catch (error: any) {
    console.error("Error in PATCH /api/fleet/vehicles/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { id } = await params;

    const { error } = await supabase
      .from("vehicles")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) {
      console.error("Error deleting vehicle:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/fleet/vehicles/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























