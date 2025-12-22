// POST /api/workforce/assets/assign - Assign equipment to employee/job
// PATCH /api/workforce/assets/assign/[id] - Return equipment

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
    const { asset_id, employee_id, job_id, notes } = body;

    if (!asset_id) {
      return NextResponse.json(
        { error: "Asset ID is required" },
        { status: 400 }
      );
    }

    // Verify asset belongs to company
    const { data: asset } = await supabase
      .from("assets")
      .select("id, status")
      .eq("id", asset_id)
      .eq("company_id", companyId)
      .single();

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Check if asset is already assigned
    if (asset.status === "assigned") {
      const { data: existingAssignment } = await supabase
        .from("asset_assignments")
        .select("id")
        .eq("asset_id", asset_id)
        .is("returned_at", null)
        .single();

      if (existingAssignment) {
        return NextResponse.json(
          { error: "Asset is already assigned" },
          { status: 400 }
        );
      }
    }

    // Create assignment
    const { data, error } = await supabase
      .from("asset_assignments")
      .insert({
        asset_id,
        employee_id: employee_id || null,
        job_id: job_id || null,
        assigned_by_user_id: user.id,
        notes: notes || null,
      })
      .select(`
        *,
        asset:assets(*),
        employee:workforce_employees(first_name, last_name),
        job:jobs(id, stage)
      `)
      .single();

    if (error) {
      console.error("Error creating assignment:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assignment: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/assets/assign:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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
    const { assignment_id } = body;

    if (!assignment_id) {
      return NextResponse.json(
        { error: "Assignment ID is required" },
        { status: 400 }
      );
    }

    // Verify assignment exists and asset belongs to company
    const { data: assignment } = await supabase
      .from("asset_assignments")
      .select(`
        *,
        asset:assets!inner(id, company_id)
      `)
      .eq("id", assignment_id)
      .single();

    if (!assignment || assignment.asset.company_id !== companyId) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 }
      );
    }

    // Return the asset
    const { data: updatedAssignment, error } = await supabase
      .from("asset_assignments")
      .update({
        returned_at: new Date().toISOString(),
      })
      .eq("id", assignment_id)
      .select(`
        *,
        asset:assets(*),
        employee:workforce_employees(first_name, last_name),
        job:jobs(id, stage)
      `)
      .single();

    if (error) {
      console.error("Error returning assignment:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assignment: updatedAssignment });
  } catch (error: any) {
    console.error("Error in PATCH /api/workforce/assets/assign:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























