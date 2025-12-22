// GET /api/workforce/qc/templates - List QC checklist templates
// POST /api/workforce/qc/templates - Create QC checklist template

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
    const jobType = searchParams.get("job_type");

    let query = supabase
      .from("qc_checklist_templates")
      .select("*")
      .eq("company_id", companyId)
      .order("job_type", { ascending: true })
      .order("category", { ascending: true })
      .order("display_order", { ascending: true });

    if (jobType) {
      query = query.eq("job_type", jobType);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching QC templates:", error);
      return NextResponse.json(
        { error: "Failed to fetch QC templates" },
        { status: 500 }
      );
    }

    return NextResponse.json({ templates: data || [] });
  } catch (error) {
    console.error("Error in QC templates GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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
    const { job_type, category, item, requires_photo, display_order } = body;

    if (!job_type || !category || !item) {
      return NextResponse.json(
        { error: "Missing required fields: job_type, category, item" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("qc_checklist_templates")
      .insert({
        company_id: companyId,
        job_type,
        category,
        item,
        requires_photo: requires_photo || false,
        display_order: display_order || 0,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating QC template:", error);
      return NextResponse.json(
        { error: "Failed to create QC template" },
        { status: 500 }
      );
    }

    return NextResponse.json({ template: data }, { status: 201 });
  } catch (error) {
    console.error("Error in QC templates POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
























