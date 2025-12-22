// GET /api/workforce/assets/[id] - Get asset
// PATCH /api/workforce/assets/[id] - Update asset
// DELETE /api/workforce/assets/[id] - Delete asset

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

    // Get asset with related data
    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Get current assignment
    const { data: currentAssignment } = await supabase
      .from("asset_assignments")
      .select(`
        *,
        employee:workforce_employees(first_name, last_name, phone, email),
        job:jobs(id, stage)
      `)
      .eq("asset_id", id)
      .is("returned_at", null)
      .order("assigned_at", { ascending: false })
      .limit(1)
      .single();

    // Get open damage reports
    const { data: openDamageReports } = await supabase
      .from("asset_damage_reports")
      .select(`
        *,
        employee:workforce_employees(first_name, last_name),
        job:jobs(id, stage)
      `)
      .eq("asset_id", id)
      .eq("resolved", false)
      .order("reported_at", { ascending: false });

    // Get next maintenance
    const { data: nextMaintenance } = await supabase
      .from("asset_maintenance")
      .select("*")
      .eq("asset_id", id)
      .gte("next_due", new Date().toISOString().split("T")[0])
      .order("next_due", { ascending: true })
      .limit(1)
      .single();

    // Get assignment history
    const { data: assignmentHistory } = await supabase
      .from("asset_assignments")
      .select(`
        *,
        employee:workforce_employees(first_name, last_name),
        job:jobs(id, stage)
      `)
      .eq("asset_id", id)
      .order("assigned_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      asset: {
        ...asset,
        current_assignment: currentAssignment || null,
        open_damage_reports: openDamageReports || [],
        next_maintenance: nextMaintenance || null,
        assignment_history: assignmentHistory || [],
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/assets/[id]:", error);
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

    // Verify asset belongs to company
    const { data: existingAsset } = await supabase
      .from("assets")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!existingAsset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("assets")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating asset:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ asset: data });
  } catch (error: any) {
    console.error("Error in PATCH /api/workforce/assets/[id]:", error);
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

    // Verify asset belongs to company
    const { data: existingAsset } = await supabase
      .from("assets")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!existingAsset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Check if asset is currently assigned
    const { data: activeAssignment } = await supabase
      .from("asset_assignments")
      .select("id")
      .eq("asset_id", id)
      .is("returned_at", null)
      .single();

    if (activeAssignment) {
      return NextResponse.json(
        { error: "Cannot delete asset that is currently assigned" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("assets").delete().eq("id", id);

    if (error) {
      console.error("Error deleting asset:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/workforce/assets/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























