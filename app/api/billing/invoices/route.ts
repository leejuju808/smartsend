import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * POST /api/billing/invoices
 * Create a new invoice
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
      job_id,
      customer_id,
      amount,
      due_date,
      issue_date,
      notes,
      scope_summary,
      line_items = [],
    } = body;

    // Validate required fields
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Amount is required and must be greater than 0" },
        { status: 400 }
      );
    }

    if (!due_date) {
      return NextResponse.json(
        { error: "Due date is required" },
        { status: 400 }
      );
    }

    // Generate invoice number
    const { data: invoiceNumberData, error: invoiceNumberError } = await supabase
      .rpc("generate_invoice_number", { p_workspace_id: workspaceId });

    if (invoiceNumberError) {
      console.error("Error generating invoice number:", invoiceNumberError);
      // Fallback to timestamp-based number
      const fallbackNumber = `INV-${Date.now()}`;
      
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          workspace_id: workspaceId,
          job_id: job_id || null,
          customer_id: customer_id || null,
          invoice_number: fallbackNumber,
          amount,
          due_date,
          issue_date: issue_date || new Date().toISOString().split('T')[0],
          notes: notes || null,
          scope_summary: scope_summary || null,
          line_items: line_items.length > 0 ? line_items : [],
          status: 'unpaid',
          created_by: user.id,
        })
        .select()
        .single();

      if (invoiceError) {
        console.error("Error creating invoice:", invoiceError);
        return NextResponse.json(
          { error: "Failed to create invoice", details: invoiceError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ invoice });
    }

    const invoiceNumber = invoiceNumberData || `INV-${Date.now()}`;

    // Create invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        workspace_id: workspaceId,
        job_id: job_id || null,
        customer_id: customer_id || null,
        invoice_number,
        amount,
        due_date,
        issue_date: issue_date || new Date().toISOString().split('T')[0],
        notes: notes || null,
        scope_summary: scope_summary || null,
        line_items: line_items.length > 0 ? line_items : [],
        status: 'unpaid',
        created_by: user.id,
      })
      .select()
      .single();

    if (invoiceError) {
      console.error("Error creating invoice:", invoiceError);
      return NextResponse.json(
        { error: "Failed to create invoice", details: invoiceError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ invoice });
  } catch (error: any) {
    console.error("Error in POST /api/billing/invoices:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/billing/invoices
 * List invoices for the current workspace
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
    const jobId = searchParams.get("job_id");
    const customerId = searchParams.get("customer_id");
    const status = searchParams.get("status");
    const overdue = searchParams.get("overdue") === "true";

    let query = supabase
      .from("invoices")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (overdue) {
      query = query.lt("due_date", new Date().toISOString().split('T')[0])
        .in("status", ["unpaid", "partial"]);
    }

    const { data: invoices, error } = await query;

    if (error) {
      console.error("Error fetching invoices:", error);
      return NextResponse.json(
        { error: "Failed to fetch invoices" },
        { status: 500 }
      );
    }

    return NextResponse.json({ invoices: invoices || [] });
  } catch (error: any) {
    console.error("Error in GET /api/billing/invoices:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}






















