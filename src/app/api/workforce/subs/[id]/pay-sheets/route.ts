// GET /api/workforce/subs/[id]/pay-sheets - List pay sheets for sub
// POST /api/workforce/subs/[id]/pay-sheets - Create pay sheet

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

    // Verify subcontractor belongs to company
    const { data: sub } = await supabase
      .from("subcontractors")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!sub) {
      return NextResponse.json({ error: "Subcontractor not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("sub_pay_sheets")
      .select(`
        *,
        jobs:job_id (
          id,
          homeowner_name,
          address,
          stage
        )
      `)
      .eq("sub_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching pay sheets:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pay_sheets: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/subs/[id]/pay-sheets:", error);
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
    const { job_id, pay_type, rate, quantity, notes } = body;

    if (!job_id || !pay_type || !rate) {
      return NextResponse.json(
        { error: "job_id, pay_type, and rate are required" },
        { status: 400 }
      );
    }

    // Verify subcontractor belongs to company
    const { data: sub } = await supabase
      .from("subcontractors")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!sub) {
      return NextResponse.json({ error: "Subcontractor not found" }, { status: 404 });
    }

    // Calculate total pay
    let totalPay = 0;
    const rateNum = parseFloat(rate.toString());
    const quantityNum = quantity ? parseFloat(quantity.toString()) : 1;

    if (pay_type === "per_square" || pay_type === "hourly") {
      totalPay = rateNum * quantityNum;
    } else if (pay_type === "flat_rate") {
      totalPay = rateNum;
    }

    const { data, error } = await supabase
      .from("sub_pay_sheets")
      .insert({
        job_id,
        sub_id: id,
        pay_type,
        rate: rateNum,
        quantity: quantityNum,
        total_pay: totalPay,
        notes: notes || null,
        created_by: user.id,
      })
      .select(`
        *,
        jobs:job_id (
          id,
          homeowner_name,
          address
        )
      `)
      .single();

    if (error) {
      console.error("Error creating pay sheet:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pay_sheet: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/subs/[id]/pay-sheets:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























