// GET /api/fleet/vehicles - List fleet vehicles
// POST /api/fleet/vehicles - Create vehicle

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
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    let query = supabase
      .from("vehicles")
      .select(`
        *,
        current_assignment:vehicle_assignments!left(
          id,
          employee_id,
          job_id,
          assigned_at,
          employee:workforce_employees(first_name, last_name)
        )
      `)
      .eq("company_id", companyId)
      .is("current_assignment.returned_at", null)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,license_plate.ilike.%${search}%,make.ilike.%${search}%,model.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching vehicles:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get additional computed data for each vehicle
    const vehiclesWithData = await Promise.all(
      (data || []).map(async (vehicle) => {
        // Get latest mileage
        const { data: latestMileage } = await supabase
          .from("mileage_logs")
          .select("end_miles, date")
          .eq("vehicle_id", vehicle.id)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Get maintenance due status
        const { data: overdueMaintenance } = await supabase
          .from("vehicle_maintenance")
          .select("maintenance_type, next_due_mileage")
          .eq("vehicle_id", vehicle.id)
          .eq("is_overdue", true);

        // Get fuel cost MTD
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        const { data: fuelData } = await supabase
          .from("fuel_logs")
          .select("cost")
          .eq("vehicle_id", vehicle.id)
          .gte("filled_at", startOfMonth.toISOString());

        const fuelCostMTD = fuelData?.reduce((sum, f) => sum + Number(f.cost || 0), 0) || 0;

        // Get next maintenance due
        const nextMaintenance = overdueMaintenance?.[0];

        return {
          ...vehicle,
          current_mileage: latestMileage?.end_miles || 0,
          last_mileage_date: latestMileage?.date || null,
          maintenance_due: nextMaintenance
            ? `${nextMaintenance.maintenance_type.replace("_", " ")} (${nextMaintenance.next_due_mileage} mi)`
            : null,
          fuel_cost_mtd: fuelCostMTD,
        };
      })
    );

    return NextResponse.json({ vehicles: vehiclesWithData });
  } catch (error: any) {
    console.error("Error in GET /api/fleet/vehicles:", error);
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
      name,
      license_plate,
      vin,
      make,
      model,
      year,
      status,
      photo_url,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("vehicles")
      .insert({
        company_id: companyId,
        name,
        license_plate: license_plate || null,
        vin: vin || null,
        make: make || null,
        model: model || null,
        year: year || null,
        status: status || "active",
        photo_url: photo_url || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating vehicle:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ vehicle: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/fleet/vehicles:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























