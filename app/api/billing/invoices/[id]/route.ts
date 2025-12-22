import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * GET /api/billing/invoices/[id]
 * Get a single invoice by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (error || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Get payments for this invoice
    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .eq("invoice_id", params.id)
      .order("date", { ascending: false });

    return NextResponse.json({
      invoice,
      payments: payments || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/billing/invoices/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/billing/invoices/[id]
 * Update an invoice
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Verify invoice exists and belongs to workspace
    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!existingInvoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const {
      amount,
      due_date,
      notes,
      scope_summary,
      line_items,
      status,
    } = body;

    const updateData: any = {};
    if (amount !== undefined) updateData.amount = amount;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (notes !== undefined) updateData.notes = notes;
    if (scope_summary !== undefined) updateData.scope_summary = scope_summary;
    if (line_items !== undefined) updateData.line_items = line_items;
    if (status !== undefined) updateData.status = status;

    const { data: invoice, error } = await supabase
      .from("invoices")
      .update(updateData)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating invoice:", error);
      return NextResponse.json(
        { error: "Failed to update invoice" },
        { status: 500 }
      );
    }

    return NextResponse.json({ invoice });
  } catch (error: any) {
    console.error("Error in PATCH /api/billing/invoices/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/billing/invoices/[id]
 * Delete an invoice (soft delete by setting status to cancelled)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Verify invoice exists and belongs to workspace
    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id, status")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!existingInvoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Soft delete by setting status to cancelled
    const { data: invoice, error } = await supabase
      .from("invoices")
      .update({ status: "cancelled" })
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      console.error("Error cancelling invoice:", error);
      return NextResponse.json(
        { error: "Failed to cancel invoice" },
        { status: 500 }
      );
    }

    return NextResponse.json({ invoice });
  } catch (error: any) {
    console.error("Error in DELETE /api/billing/invoices/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}






















