// POST /api/workforce/assets/report-damage - Report asset damage

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
    const { asset_id, employee_id, job_id, description, severity, photo_url } =
      body;

    if (!asset_id || !description || !severity) {
      return NextResponse.json(
        { error: "Asset ID, description, and severity are required" },
        { status: 400 }
      );
    }

    // Verify asset belongs to company
    const { data: asset } = await supabase
      .from("assets")
      .select("id, company_id")
      .eq("id", asset_id)
      .eq("company_id", companyId)
      .single();

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Create damage report
    const { data, error } = await supabase
      .from("asset_damage_reports")
      .insert({
        asset_id,
        employee_id: employee_id || null,
        job_id: job_id || null,
        description,
        severity,
        photo_url: photo_url || null,
        reported_by_user_id: user.id,
      })
      .select(`
        *,
        asset:assets(name, category),
        employee:workforce_employees(first_name, last_name),
        job:jobs(id, stage)
      `)
      .single();

    if (error) {
      console.error("Error creating damage report:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // TODO: Send notification to PM about damage report
    // This would integrate with your notification system

    return NextResponse.json({ damage_report: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/assets/report-damage:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























