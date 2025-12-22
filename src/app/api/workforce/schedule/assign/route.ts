// Block 251900 — Crew Assignment Engine
// POST /api/workforce/schedule/assign
// Assign a crew member to a job on a specific date

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

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
      assigned_date,
      role_on_job,
      allow_pending_permit,
    } = body;

    if (!job_id || !employee_id || !assigned_date) {
      return NextResponse.json(
        { error: "job_id, employee_id, and assigned_date are required" },
        { status: 400 }
      );
    }

    // Verify job belongs to company
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id")
      .eq("id", job_id)
      .eq("company_id", companyId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // --------------------------------------------------------------------
    // Permit Guardrail — Block scheduling if permits are not ready
    // --------------------------------------------------------------------
    // Uses jobs_permit_readiness view from Block 257200.
    // - approved   → always allowed
    // - submitted / pending → allowed only if allow_pending_permit = true
    // - not_started / expired / rejected → blocked

    const { data: readiness } = await supabase
      .from("jobs_permit_readiness")
      .select("permit_summary_status")
      .eq("job_id", job_id)
      .maybeSingle();

    const permitStatus: string = readiness?.permit_summary_status || "not_started";

    if (permitStatus === "approved") {
      // ok
    } else if (permitStatus === "submitted" || permitStatus === "pending") {
      if (!allow_pending_permit) {
        return NextResponse.json(
          {
            error:
              "Permit is not fully approved yet (status: " +
              permitStatus +
              "). Set allow_pending_permit=true to proceed anyway.",
            code: "PERMIT_PENDING",
          },
          { status: 409 }
        );
      }
    } else if (
      permitStatus === "not_started" ||
      permitStatus === "expired" ||
      permitStatus === "rejected"
    ) {
      return NextResponse.json(
        {
          error:
            "Cannot schedule crew yet — permit not ready (status: " +
            permitStatus +
            ").",
          code: "PERMIT_NOT_READY",
        },
        { status: 409 }
      );
    }

    // Verify employee belongs to company
    const { data: employee, error: empError } = await supabase
      .from("workforce_employees")
      .select("id, company_id, status, role")
      .eq("id", employee_id)
      .eq("company_id", companyId)
      .single();

    if (empError || !employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    if (employee.status !== "active") {
      return NextResponse.json(
        { error: "Cannot assign inactive employee" },
        { status: 400 }
      );
    }

    // Insert assignment
    const { data, error } = await supabase
      .from("crew_assignments")
      .insert({
        job_id,
        employee_id,
        assigned_date,
        role_on_job: role_on_job || employee.role || null,
        assigned_by: user.id,
      })
      .select(`
        *,
        employee:workforce_employees(first_name, last_name, role),
        job:jobs(homeowner_name, address)
      `)
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Employee already assigned to this job on this date" },
          { status: 409 }
        );
      }
      console.error("Error creating assignment:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, assignment: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/schedule/assign:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/workforce/schedule/assign
// Remove a crew assignment

export async function DELETE(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const assignmentId = searchParams.get("id");
    const jobId = searchParams.get("job_id");
    const employeeId = searchParams.get("employee_id");
    const assignedDate = searchParams.get("assigned_date");

    if (!assignmentId && (!jobId || !employeeId || !assignedDate)) {
      return NextResponse.json(
        { error: "Either id or (job_id, employee_id, assigned_date) required" },
        { status: 400 }
      );
    }

    let query = supabase.from("crew_assignments").delete();

    if (assignmentId) {
      query = query.eq("id", assignmentId);
    } else {
      query = query
        .eq("job_id", jobId!)
        .eq("employee_id", employeeId!)
        .eq("assigned_date", assignedDate!);
    }

    // Verify assignment belongs to company
    if (!assignmentId) {
      const { data: check } = await supabase
        .from("crew_assignments")
        .select(`
          id,
          job:jobs(company_id),
          employee:workforce_employees(company_id)
        `)
        .eq("job_id", jobId!)
        .eq("employee_id", employeeId!)
        .eq("assigned_date", assignedDate!)
        .single();

      if (!check || (check.job as any)?.company_id !== companyId) {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }
    }

    const { error } = await query;

    if (error) {
      console.error("Error deleting assignment:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/workforce/schedule/assign:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























