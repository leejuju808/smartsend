// Block 251900 — Crew Assignment Engine
// GET /api/workforce/jobs/[id]/requirements - Get job requirements
// POST /api/workforce/jobs/[id]/requirements - Set job requirements

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

    // Verify job belongs to company
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Get requirements
    const { data, error } = await supabase
      .from("job_requirements")
      .select("*")
      .eq("job_id", id)
      .order("required_role", { ascending: true });

    if (error) {
      console.error("Error fetching requirements:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ requirements: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/jobs/[id]/requirements:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
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
    const { requirements } = body; // Array of { required_role, quantity_needed, skill_level? }

    if (!Array.isArray(requirements)) {
      return NextResponse.json({ error: "requirements must be an array" }, { status: 400 });
    }

    // Verify job belongs to company
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Delete existing requirements
    await supabase.from("job_requirements").delete().eq("job_id", id);

    // Insert new requirements
    if (requirements.length > 0) {
      const { data, error } = await supabase
        .from("job_requirements")
        .insert(
          requirements.map((req: any) => ({
            job_id: id,
            required_role: req.required_role,
            quantity_needed: req.quantity_needed || 1,
            skill_level: req.skill_level || null,
          }))
        )
        .select("*");

      if (error) {
        console.error("Error creating requirements:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ requirements: data });
    }

    return NextResponse.json({ requirements: [] });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/jobs/[id]/requirements:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























