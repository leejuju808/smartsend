// GET /api/workforce/subcontractors/rates - List rates
// POST /api/workforce/subcontractors/rates - Create rate

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
    const subcontractorId = searchParams.get("subcontractor_id");
    const jobType = searchParams.get("job_type");

    let query = supabase
      .from("sub_rates")
      .select(`
        *,
        subcontractors!inner(id, name, company_id)
      `)
      .eq("subcontractors.company_id", companyId)
      .order("created_at", { ascending: false });

    if (subcontractorId) {
      query = query.eq("subcontractor_id", subcontractorId);
    }

    if (jobType) {
      query = query.eq("job_type", jobType);
    }

    // Only get active rates (not expired)
    query = query.or(
      `effective_end.is.null,effective_end.gte.${new Date().toISOString().split("T")[0]}`
    );

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching rates:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rates: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/subcontractors/rates:", error);
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
      subcontractor_id,
      job_type,
      rate,
      rate_type,
      effective_start,
      effective_end,
    } = body;

    // Verify subcontractor belongs to company
    const { data: sub, error: subError } = await supabase
      .from("subcontractors")
      .select("id, company_id")
      .eq("id", subcontractor_id)
      .eq("company_id", companyId)
      .single();

    if (subError || !sub) {
      return NextResponse.json(
        { error: "Subcontractor not found or access denied" },
        { status: 404 }
      );
    }

    // End any existing active rates for this job type
    if (effective_start) {
      await supabase
        .from("sub_rates")
        .update({ effective_end: new Date(effective_start).toISOString().split("T")[0] })
        .eq("subcontractor_id", subcontractor_id)
        .eq("job_type", job_type)
        .is("effective_end", null);
    }

    // Create new rate
    const { data: newRate, error: rateError } = await supabase
      .from("sub_rates")
      .insert({
        subcontractor_id,
        job_type,
        rate,
        rate_type,
        effective_start: effective_start || new Date().toISOString().split("T")[0],
        effective_end,
        created_by: user.id,
      })
      .select()
      .single();

    if (rateError) {
      console.error("Error creating rate:", rateError);
      return NextResponse.json({ error: rateError.message }, { status: 500 });
    }

    return NextResponse.json({ rate: newRate }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/subcontractors/rates:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























