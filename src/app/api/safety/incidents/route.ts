// GET /api/safety/incidents - Get safety incidents
// POST /api/safety/incidents - Create safety incident

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
    const employee_id = searchParams.get("employee_id");
    const job_id = searchParams.get("job_id");
    const incident_type = searchParams.get("incident_type");
    const severity = searchParams.get("severity");
    const resolved = searchParams.get("resolved");

    let query = supabase
      .from("safety_incidents")
      .select(`
        *,
        employee:workforce_employees(first_name, last_name, role),
        reported_by_employee:workforce_employees!safety_incidents_reported_by_fkey(first_name, last_name)
      `)
      .eq("company_id", companyId)
      .order("date", { ascending: false });

    if (employee_id) {
      query = query.eq("employee_id", employee_id);
    }

    if (job_id) {
      query = query.eq("job_id", job_id);
    }

    if (incident_type) {
      query = query.eq("incident_type", incident_type);
    }

    if (severity) {
      query = query.eq("severity", severity);
    }

    if (resolved !== null) {
      query = query.eq("resolved", resolved === "true");
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching safety incidents:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ incidents: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/safety/incidents:", error);
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
      job_id,
      employee_id,
      incident_type,
      description,
      severity,
      reported_by,
      photo_url,
      corrective_action,
    } = body;

    if (!incident_type || !description) {
      return NextResponse.json(
        { error: "Incident type and description are required" },
        { status: 400 }
      );
    }

    // Verify employee belongs to company if provided
    if (employee_id) {
      const { data: employee } = await supabase
        .from("workforce_employees")
        .select("id")
        .eq("id", employee_id)
        .eq("company_id", companyId)
        .single();

      if (!employee) {
        return NextResponse.json({ error: "Employee not found" }, { status: 404 });
      }
    }

    // Verify job belongs to company if provided
    if (job_id) {
      const { data: job } = await supabase
        .from("jobs")
        .select("id, company_id")
        .eq("id", job_id)
        .single();

      if (!job || job.company_id !== companyId) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
    }

    const { data, error } = await supabase
      .from("safety_incidents")
      .insert({
        company_id: companyId,
        job_id: job_id || null,
        employee_id: employee_id || null,
        incident_type,
        description,
        severity: severity || "low",
        reported_by: reported_by || null,
        photo_url: photo_url || null,
        corrective_action: corrective_action || null,
        resolved: false,
        date: new Date().toISOString().split('T')[0], // Store as date only
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating safety incident:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If severity is high or critical, trigger notification (handled by trigger or separate service)
    // For now, we'll just return the incident

    return NextResponse.json({ incident: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/safety/incidents:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























