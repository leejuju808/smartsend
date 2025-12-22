// Block 257200 — City / County Permit Requirement Engine
// GET  /api/workforce/permit-requirements      - List / lookup requirements
// POST /api/workforce/permit-requirements      - Upsert requirement for a company
//
// This API lets SmartSend answer:
// "What does this city require for this permit type?"

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const url = new URL(req.url);
    const city = url.searchParams.get("city");
    const state = url.searchParams.get("state");
    const permitType = url.searchParams.get("permit_type");

    let query = supabase
      .from("city_permit_requirements")
      .select("*")
      .or(
        // rows scoped to this company OR global defaults (company_id IS NULL)
        `company_id.eq.${companyId},company_id.is.null`
      )
      .order("company_id", { ascending: false }) // prefer company-specific over global
      .order("created_at", { ascending: false });

    if (city) {
      query = query.ilike("city", city);
    }
    if (state) {
      query = query.ilike("state", state);
    }
    if (permitType) {
      query = query.eq("permit_type", permitType);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching city_permit_requirements:", error);
      return NextResponse.json(
        { error: "Failed to load permit requirements" },
        { status: 500 }
      );
    }

    // If the caller provided city/state/permit_type, surface the "best" match
    if (city && state && permitType) {
      const requirement = data?.[0] ?? null;
      return NextResponse.json({ requirement, requirements: data || [] });
    }

    return NextResponse.json({ requirements: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/permit-requirements:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const body = await req.json();

    const {
      id,
      city,
      state,
      jurisdiction,
      permit_type,
      permit_required,
      base_fee,
      turnaround_days,
      inspection_requirements,
      rules,
      special_conditions,
      notes,
    } = body;

    if (!city || !state || !permit_type) {
      return NextResponse.json(
        { error: "city, state, and permit_type are required" },
        { status: 400 }
      );
    }

    let result;
    if (id) {
      const { data, error } = await supabase
        .from("city_permit_requirements")
        .update({
          city,
          state,
          jurisdiction: jurisdiction || null,
          permit_type,
          permit_required:
            typeof permit_required === "boolean" ? permit_required : true,
          base_fee: base_fee ?? null,
          turnaround_days: turnaround_days ?? null,
          inspection_requirements: inspection_requirements ?? null,
          rules: rules || null,
          special_conditions: special_conditions || null,
          notes: notes || null,
        })
        .eq("id", id)
        .eq("company_id", companyId)
        .select("*")
        .single();

      if (error) {
        console.error("Error updating permit requirement:", error);
        return NextResponse.json(
          { error: "Failed to update permit requirement" },
          { status: 500 }
        );
      }

      result = data;
    } else {
      const { data, error } = await supabase
        .from("city_permit_requirements")
        .insert({
          company_id: companyId,
          city,
          state,
          jurisdiction: jurisdiction || null,
          permit_type,
          permit_required:
            typeof permit_required === "boolean" ? permit_required : true,
          base_fee: base_fee ?? null,
          turnaround_days: turnaround_days ?? null,
          inspection_requirements: inspection_requirements ?? null,
          rules: rules || null,
          special_conditions: special_conditions || null,
          notes: notes || null,
        })
        .select("*")
        .single();

      if (error) {
        console.error("Error creating permit requirement:", error);
        return NextResponse.json(
          { error: "Failed to create permit requirement" },
          { status: 500 }
        );
      }

      result = data;
    }

    return NextResponse.json({ requirement: result });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/permit-requirements:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}















