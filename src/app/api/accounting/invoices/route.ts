import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generate_invoice_number } from "@/lib/accounting";

/**
 * GET /api/accounting/invoices
 * List invoices with filters
 * Query params: job_id, customer_id, status, invoice_type, team_id
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    // Get current user's teams
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id);

    if (!teamMembers || teamMembers.length === 0) {
      return NextResponse.json({ invoices: [] });
    }

    const teamIds = teamMembers.map((tm) => tm.team_id);
    const jobId = searchParams.get("job_id");
    const customerId = searchParams.get("customer_id");
    const status = searchParams.get("status");
    const invoiceType = searchParams.get("invoice_type");
    const teamId = searchParams.get("team_id");

    let query = supabase
      .from("invoices")
      .select(`
        *,
        jobs (
          id,
          stage,
          contract_value
        ),
        customers (
          id,
          name,
          email,
          phone
        ),
        payments (
          id,
          amount,
          payment_method,
          received_at
        )
      `)
      .in("team_id", teamIds)
      .order("created_at", { ascending: false });

    if (teamId && teamIds.includes(teamId)) {
      query = query.eq("team_id", teamId);
    }

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (invoiceType) {
      query = query.eq("invoice_type", invoiceType);
    }

    const { data: invoices, error } = await query;

    if (error) {
      console.error("Error fetching invoices:", error);
      return NextResponse.json(
        { error: "Failed to fetch invoices", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ invoices: invoices || [] });
  } catch (error: any) {
    console.error("Error in list invoices:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/accounting/invoices
 * Create a new invoice
 * Body: { job_id, customer_id, invoice_type, amount, tax_amount, due_date, description, line_items, notes }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      team_id,
      job_id,
      customer_id,
      invoice_type,
      amount,
      tax_amount = 0,
      due_date,
      description,
      line_items = [],
      notes,
      is_insurance_job = false,
      insurance_claim_id,
    } = body;

    if (!team_id || !invoice_type || !amount || !due_date) {
      return NextResponse.json(
        { error: "Missing required fields: team_id, invoice_type, amount, due_date" },
        { status: 400 }
      );
    }

    // Verify user has access to this team
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", team_id)
      .eq("user_id", user.id)
      .single();

    if (!teamMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Generate invoice number
    const invoiceNumber = await generate_invoice_number(supabase, team_id);

    const totalAmount = parseFloat(amount) + parseFloat(tax_amount);

    const { data: invoice, error } = await supabase
      .from("invoices")
      .insert({
        team_id,
        job_id: job_id || null,
        customer_id: customer_id || null,
        invoice_number: invoiceNumber,
        invoice_type,
        amount: parseFloat(amount),
        tax_amount: parseFloat(tax_amount),
        total_amount: totalAmount,
        due_date,
        description,
        line_items: Array.isArray(line_items) ? line_items : [],
        notes,
        is_insurance_job,
        insurance_claim_id: insurance_claim_id || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating invoice:", error);
      return NextResponse.json(
        { error: "Failed to create invoice", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ invoice });
  } catch (error: any) {
    console.error("Error in create invoice:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
