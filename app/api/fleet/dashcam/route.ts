// GET /api/fleet/dashcam - List dashcam uploads
// POST /api/fleet/dashcam - Upload dashcam video

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
    const incidentType = searchParams.get("incident_type");

    let query = supabase
      .from("dashcam_uploads")
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

    if (incidentType) {
      query = query.eq("incident_type", incidentType);
    }

    query = query.order("uploaded_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching dashcam uploads:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ uploads: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/fleet/dashcam:", error);
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
      job_id,
      video_url,
      incident_notes,
      incident_type,
    } = body;

    if (!vehicle_id || !video_url) {
      return NextResponse.json(
        { error: "vehicle_id and video_url are required" },
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
      .from("dashcam_uploads")
      .insert({
        vehicle_id,
        employee_id: employee_id || null,
        job_id: job_id || null,
        video_url,
        incident_notes: incident_notes || null,
        incident_type: incident_type || "routine",
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating dashcam upload:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ upload: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/fleet/dashcam:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























