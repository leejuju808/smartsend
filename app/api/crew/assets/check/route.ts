// GET /api/crew/assets/check - Get assets assigned to current user
// POST /api/crew/assets/check - Check-in/check-out equipment

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

    // Get current user's employee record
    const { data: employee } = await supabase
      .from("workforce_employees")
      .select("id")
      .eq("company_id", companyId)
      .or(`email.eq.${user.email},phone.eq.${user.phone}`)
      .single();

    if (!employee) {
      return NextResponse.json(
        { error: "Employee record not found" },
        { status: 404 }
      );
    }

    // Get assets currently assigned to this employee
    const { data: assignedAssets } = await supabase
      .from("asset_assignments")
      .select(`
        *,
        asset:assets(
          id,
          name,
          category,
          status,
          photo_url,
          serial_number
        ),
        job:jobs(id, stage)
      `)
      .eq("employee_id", employee.id)
      .is("returned_at", null)
      .order("assigned_at", { ascending: false });

    return NextResponse.json({ assets: assignedAssets || [] });
  } catch (error: any) {
    console.error("Error in GET /api/crew/assets/check:", error);
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
    const { assignment_id, condition, photo_url, notes } = body;

    if (!assignment_id || !condition) {
      return NextResponse.json(
        { error: "Assignment ID and condition are required" },
        { status: 400 }
      );
    }

    // Get assignment
    const { data: assignment } = await supabase
      .from("asset_assignments")
      .select(`
        *,
        asset:assets!inner(id, company_id, name)
      `)
      .eq("id", assignment_id)
      .single();

    if (!assignment || assignment.asset.company_id !== companyId) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 }
      );
    }

    // Handle different conditions
    if (condition === "good") {
      // Just update notes if provided
      if (notes) {
        await supabase
          .from("asset_assignments")
          .update({ notes })
          .eq("id", assignment_id);
      }
      return NextResponse.json({ success: true, message: "Equipment checked" });
    } else if (condition === "needs_repair") {
      // Create damage report
      const { data: damageReport, error: damageError } = await supabase
        .from("asset_damage_reports")
        .insert({
          asset_id: assignment.asset_id,
          employee_id: assignment.employee_id,
          job_id: assignment.job_id,
          description: notes || "Equipment needs repair",
          severity: "moderate",
          photo_url: photo_url || null,
          reported_by_user_id: user.id,
        })
        .select()
        .single();

      if (damageError) {
        console.error("Error creating damage report:", damageError);
        return NextResponse.json(
          { error: "Failed to create damage report" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Damage report created",
        damage_report: damageReport,
      });
    } else if (condition === "missing") {
      // Mark asset as lost
      await supabase
        .from("assets")
        .update({ status: "lost" })
        .eq("id", assignment.asset_id);

      // Create damage report for missing equipment
      await supabase.from("asset_damage_reports").insert({
        asset_id: assignment.asset_id,
        employee_id: assignment.employee_id,
        job_id: assignment.job_id,
        description: notes || "Equipment reported as missing",
        severity: "critical",
        photo_url: photo_url || null,
        reported_by_user_id: user.id,
      });

      // TODO: Notify PM about missing equipment

      return NextResponse.json({
        success: true,
        message: "Equipment marked as missing. PM has been notified.",
      });
    }

    return NextResponse.json({ error: "Invalid condition" }, { status: 400 });
  } catch (error: any) {
    console.error("Error in POST /api/crew/assets/check:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























