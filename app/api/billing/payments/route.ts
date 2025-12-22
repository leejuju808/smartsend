import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * POST /api/billing/payments
 * Record a payment
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      invoice_id,
      amount,
      date,
      method,
      transaction_id,
      reference_number,
      processor,
      notes,
      status = "completed",
    } = body;

    // Validate required fields
    if (!invoice_id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Amount is required and must be greater than 0" },
        { status: 400 }
      );
    }

    if (!method) {
      return NextResponse.json(
        { error: "Payment method is required" },
        { status: 400 }
      );
    }

    // Verify invoice exists and belongs to workspace
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, amount, paid_amount, balance")
      .eq("id", invoice_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Check if payment amount exceeds balance
    if (amount > invoice.balance) {
      return NextResponse.json(
        { error: "Payment amount exceeds invoice balance" },
        { status: 400 }
      );
    }

    // Create payment
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        invoice_id,
        workspace_id,
        amount,
        date: date || new Date().toISOString(),
        method,
        transaction_id: transaction_id || null,
        reference_number: reference_number || null,
        processor: processor || "manual",
        status,
        notes: notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (paymentError) {
      console.error("Error creating payment:", paymentError);
      return NextResponse.json(
        { error: "Failed to create payment", details: paymentError.message },
        { status: 500 }
      );
    }

    // Create collections event for payment received
    await supabase
      .from("collections_events")
      .insert({
        invoice_id,
        workspace_id,
        event_type: "payment_received",
        message: `Payment of $${amount} received via ${method}`,
        channel: "system",
        automated: true,
      });

    return NextResponse.json({ payment });
  } catch (error: any) {
    console.error("Error in POST /api/billing/payments:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/billing/payments
 * List payments
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace required" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const invoiceId = searchParams.get("invoice_id");
    const method = searchParams.get("method");
    const status = searchParams.get("status");

    let query = supabase
      .from("payments")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("date", { ascending: false });

    if (invoiceId) {
      query = query.eq("invoice_id", invoiceId);
    }

    if (method) {
      query = query.eq("method", method);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: payments, error } = await query;

    if (error) {
      console.error("Error fetching payments:", error);
      return NextResponse.json(
        { error: "Failed to fetch payments" },
        { status: 500 }
      );
    }

    return NextResponse.json({ payments: payments || [] });
  } catch (error: any) {
    console.error("Error in GET /api/billing/payments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}






















