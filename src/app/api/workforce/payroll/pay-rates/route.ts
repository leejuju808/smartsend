// GET /api/workforce/payroll/pay-rates - Get pay rates
// POST /api/workforce/payroll/pay-rates - Create/update pay rate

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

    const { data, error } = await supabase
      .from("role_pay_rates")
      .select("*")
      .eq("company_id", companyId)
      .order("role");

    if (error) {
      console.error("Error fetching pay rates:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pay_rates: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/payroll/pay-rates:", error);
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
    const { role, hourly_rate, overtime_multiplier, doubletime_multiplier } = body;

    if (!role || hourly_rate === undefined) {
      return NextResponse.json(
        { error: "role and hourly_rate are required" },
        { status: 400 }
      );
    }

    // Upsert (insert or update)
    const { data, error } = await supabase
      .from("role_pay_rates")
      .upsert(
        {
          company_id: companyId,
          role,
          hourly_rate,
          overtime_multiplier: overtime_multiplier || 1.5,
          doubletime_multiplier: doubletime_multiplier || 2.0,
        },
        {
          onConflict: "company_id,role",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error upserting pay rate:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pay_rate: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/payroll/pay-rates:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























