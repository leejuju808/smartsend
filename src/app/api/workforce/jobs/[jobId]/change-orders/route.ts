// GET /api/workforce/jobs/[jobId]/change-orders - List change orders
// POST /api/workforce/jobs/[jobId]/change-orders - Create change order

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
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

    const { jobId } = await params;

    // Verify job belongs to company
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    if (job.company_id !== companyId) {
      return NextResponse.json(
        { error: "You don't have access to this job" },
        { status: 403 }
      );
    }

    // Get change orders
    const { data: changeOrders, error } = await supabase
      .from("change_orders")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching change orders:", error);
      return NextResponse.json(
        { error: "Failed to fetch change orders" },
        { status: 500 }
      );
    }

    return NextResponse.json({ change_orders: changeOrders || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/jobs/[jobId]/change-orders:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
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

    const { jobId } = await params;
    const body = await req.json();

    // Verify job belongs to company
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    if (job.company_id !== companyId) {
      return NextResponse.json(
        { error: "You don't have access to this job" },
        { status: 403 }
      );
    }

    // Generate change order number
    const { data: coNumber } = await supabase.rpc("generate_change_order_number", {
      p_job_id: jobId,
    });

    // Generate signature token
    const signatureToken = `co_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // Get employee ID
    let employeeId = null;
    const { data: employee } = await supabase
      .from("workforce_employees")
      .select("id")
      .eq("company_id", companyId)
      .limit(1)
      .single();
    
    employeeId = employee?.id || null;

    // Create change order
    const { data: changeOrder, error } = await supabase
      .from("change_orders")
      .insert({
        job_id: jobId,
        company_id: companyId,
        change_order_number: coNumber || null,
        description: body.description,
        price_difference: body.price_difference,
        status: "pending",
        signature_token: signatureToken,
        signature_link_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        notes: body.notes || null,
        created_by: employeeId,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating change order:", error);
      return NextResponse.json(
        { error: "Failed to create change order" },
        { status: 500 }
      );
    }

    return NextResponse.json({ change_order: changeOrder });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/jobs/[jobId]/change-orders:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
























