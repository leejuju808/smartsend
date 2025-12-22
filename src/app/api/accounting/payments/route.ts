import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/accounting/payments
 * List payments with filters
 * Query params: invoice_id, team_id, payment_method
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id);

    if (!teamMembers || teamMembers.length === 0) {
      return NextResponse.json({ payments: [] });
    }

    const teamIds = teamMembers.map((tm) => tm.team_id);
    const invoiceId = searchParams.get("invoice_id");
    const teamId = searchParams.get("team_id");
    const paymentMethod = searchParams.get("payment_method");

    let query = supabase
      .from("payments")
      .select(`
        *,
        invoices (
          id,
          invoice_number,
          invoice_type,
          total_amount,
          customer_id,
          customers (
            id,
            name
          )
        ),
        recorded_by:users!payments_recorded_by_fkey (
          id,
          email
        )
      `)
      .in("team_id", teamIds)
      .order("received_at", { ascending: false });

    if (teamId && teamIds.includes(teamId)) {
      query = query.eq("team_id", teamId);
    }

    if (invoiceId) {
      query = query.eq("invoice_id", invoiceId);
    }

    if (paymentMethod) {
      query = query.eq("payment_method", paymentMethod);
    }

    const { data: payments, error } = await query;

    if (error) {
      console.error("Error fetching payments:", error);
      return NextResponse.json(
        { error: "Failed to fetch payments", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ payments: payments || [] });
  } catch (error: any) {
    console.error("Error in list payments:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/accounting/payments
 * Record a payment
 * Body: { invoice_id, amount, payment_method, payment_reference, note }
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
      invoice_id,
      amount,
      payment_method,
      payment_reference,
      note,
    } = body;

    if (!invoice_id || !amount || !payment_method) {
      return NextResponse.json(
        { error: "Missing required fields: invoice_id, amount, payment_method" },
        { status: 400 }
      );
    }

    // Get invoice to verify access
    const { data: invoice } = await supabase
      .from("invoices")
      .select("team_id, total_amount, paid_amount")
      .eq("id", invoice_id)
      .single();

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Verify access
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", invoice.team_id)
      .eq("user_id", user.id)
      .single();

    if (!teamMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check if payment exceeds remaining balance
    const remainingBalance = invoice.total_amount - (invoice.paid_amount || 0);
    if (parseFloat(amount) > remainingBalance) {
      return NextResponse.json(
        { error: `Payment amount ($${amount}) exceeds remaining balance ($${remainingBalance.toFixed(2)})` },
        { status: 400 }
      );
    }

    // Create payment
    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        team_id: invoice.team_id,
        invoice_id,
        amount: parseFloat(amount),
        payment_method,
        payment_reference: payment_reference || null,
        note: note || null,
        recorded_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error recording payment:", error);
      return NextResponse.json(
        { error: "Failed to record payment", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ payment });
  } catch (error: any) {
    console.error("Error in record payment:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
