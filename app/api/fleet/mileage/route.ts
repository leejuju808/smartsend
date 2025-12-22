// GET /api/fleet/mileage - List mileage logs
// POST /api/fleet/mileage - Create mileage log

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
      .from("mileage_logs")
      .select(`
        *,
        vehicle:vehicles(id, name, company_id),
        employee:workforce_employees(id, first_name, last_name),
        job:roofing_jobs(id, title)
      `)
      .in("vehicle.company_id", [companyId]);

    if (vehicleId) {
      query = query.eq("vehicle_id", vehicleId);
    }

    if (startDate) {
      query = query.gte("date", startDate);
    }

    if (endDate) {
      query = query.lte("date", endDate);
    }

    query = query.order("date", { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching mileage logs:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/fleet/mileage:", error);
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
      start_miles,
      end_miles,
      date,
      job_id,
      start_odometer_photo_url,
      end_odometer_photo_url,
      condition_check,
      damage_report,
    } = body;

    if (!vehicle_id || !employee_id || start_miles === undefined || end_miles === undefined) {
      return NextResponse.json(
        { error: "vehicle_id, employee_id, start_miles, and end_miles are required" },
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
      .from("mileage_logs")
      .insert({
        vehicle_id,
        employee_id,
        start_miles: Number(start_miles),
        end_miles: Number(end_miles),
        date: date || new Date().toISOString().split("T")[0],
        job_id: job_id || null,
        start_odometer_photo_url: start_odometer_photo_url || null,
        end_odometer_photo_url: end_odometer_photo_url || null,
        condition_check: condition_check || {},
        damage_report: damage_report || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating mileage log:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ log: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/fleet/mileage:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























