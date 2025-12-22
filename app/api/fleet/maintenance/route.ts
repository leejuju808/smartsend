// GET /api/fleet/maintenance - List maintenance schedules
// POST /api/fleet/maintenance - Create maintenance schedule

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(req: NextRequest) {
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

    const searchParams = req.nextUrl.searchParams;
    const vehicleId = searchParams.get("vehicle_id");
    const overdue = searchParams.get("overdue");

    let query = supabase
      .from("vehicle_maintenance")
      .select(`
        *,
        vehicle:vehicles(id, name, company_id)
      `)
      .in("vehicle.company_id", [companyId]);

    if (vehicleId) {
      query = query.eq("vehicle_id", vehicleId);
    }

    if (overdue === "true") {
      query = query.eq("is_overdue", true);
    }

    query = query.order("next_due_mileage", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching maintenance:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ maintenance: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/fleet/maintenance:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const {
      vehicle_id,
      maintenance_type,
      interval_miles,
      last_mileage,
      last_service_date,
      next_due_date,
      notes,
    } = body;

    if (!vehicle_id || !maintenance_type || last_mileage === undefined) {
      return NextResponse.json(
        { error: "vehicle_id, maintenance_type, and last_mileage are required" },
        { status: 400 }
      );
    }

    // Verify vehicle belongs to company
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("company_id")
      .eq("id", vehicle_id)
      .eq("company_id", companyId)
      .single();

    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("vehicle_maintenance")
      .insert({
        vehicle_id,
        maintenance_type,
        interval_miles: interval_miles || 3000,
        last_mileage: Number(last_mileage),
        last_service_date: last_service_date || null,
        next_due_date: next_due_date || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating maintenance schedule:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ maintenance: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/fleet/maintenance:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























