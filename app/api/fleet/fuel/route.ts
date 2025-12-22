// GET /api/fleet/fuel - List fuel logs
// POST /api/fleet/fuel - Create fuel log

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
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    let query = supabase
      .from("fuel_logs")
      .select(`
        *,
        vehicle:vehicles(id, name, company_id),
        employee:workforce_employees(id, first_name, last_name)
      `)
      .in("vehicle.company_id", [companyId]);

    if (vehicleId) {
      query = query.eq("vehicle_id", vehicleId);
    }

    if (startDate) {
      query = query.gte("filled_at", startDate);
    }

    if (endDate) {
      query = query.lte("filled_at", endDate);
    }

    query = query.order("filled_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching fuel logs:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/fleet/fuel:", error);
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
      employee_id,
      gallons,
      cost,
      receipt_url,
      photo_url,
      pump_photo_url,
    } = body;

    if (!vehicle_id || !employee_id || !gallons || cost === undefined) {
      return NextResponse.json(
        { error: "vehicle_id, employee_id, gallons, and cost are required" },
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
      .from("fuel_logs")
      .insert({
        vehicle_id,
        employee_id,
        gallons: Number(gallons),
        cost: Number(cost),
        receipt_url: receipt_url || null,
        photo_url: photo_url || null,
        pump_photo_url: pump_photo_url || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating fuel log:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ log: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/fleet/fuel:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























