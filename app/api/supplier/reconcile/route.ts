// Block 241000 — SmartSend Roofing Supplier Hub v1
// POST /api/supplier/reconcile
// Reconcile costs for a job or PO

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      job_id,
      po_id,
      reconcile_invoice_id, // Optional: mark specific invoice as reconciled
    } = body;

    if (!job_id && !po_id) {
      return NextResponse.json(
        { error: "job_id or po_id is required" },
        { status: 400 }
      );
    }

    let reconciliation;

    if (job_id) {
      // Reconcile all costs for a job
      // Use helper function from migration
      const { data: reconData, error: reconError } = await supabase
        .rpc("get_job_cost_reconciliation", { p_job_id: job_id });

      if (reconError) {
        console.error("Reconciliation error:", reconError);
        // Fallback to manual calculation
        reconciliation = await calculateJobReconciliation(supabase, job_id);
      } else {
        reconciliation = reconData?.[0];
      }

      // Get all POs and invoices for this job
      const { data: pos } = await supabase
        .from("purchase_orders")
        .select(`
          *,
          po_items (*),
          suppliers (*),
          supplier_invoices (*)
        `)
        .eq("job_id", job_id);

      return NextResponse.json({
        job_id,
        reconciliation,
        purchase_orders: pos || [],
      });
    } else if (po_id) {
      // Reconcile single PO
      const { data: po } = await supabase
        .from("purchase_orders")
        .select(`
          *,
          po_items (*),
          suppliers (*),
          supplier_invoices (*)
        `)
        .eq("id", po_id)
        .single();

      if (!po) {
        return NextResponse.json(
          { error: "Purchase order not found" },
          { status: 404 }
        );
      }

      const poTotal = po.total_cost || 0;
      const invoiceTotal = (po.supplier_invoices || []).reduce(
        (sum: number, inv: any) => sum + (inv.amount || 0),
        0
      );
      const variance = invoiceTotal - poTotal;
      const variancePercent = poTotal > 0 ? (variance / poTotal * 100) : 0;

      reconciliation = {
        estimated_cost: null,
        po_total_cost: poTotal,
        invoice_total: invoiceTotal,
        variance,
        variance_percent: variancePercent,
      };

      // Mark invoice as reconciled if specified
      if (reconcile_invoice_id) {
        await supabase
          .from("supplier_invoices")
          .update({
            reconciled: true,
            reconciled_at: new Date().toISOString(),
            reconciled_by: user.id,
          })
          .eq("id", reconcile_invoice_id);
      }

      return NextResponse.json({
        po_id,
        reconciliation,
        purchase_order: po,
      });
    }

    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Error in POST /api/supplier/reconcile:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper function for manual reconciliation calculation
async function calculateJobReconciliation(supabase: any, jobId: string) {
  // Get estimated cost from job materials
  const { data: job } = await supabase
    .from("jobs")
    .select("materials, estimated_value")
    .eq("id", jobId)
    .single();

  const estimatedCost = job?.estimated_value || (job?.materials as any)?.total_cost || 0;

  // Get PO total
  const { data: pos } = await supabase
    .from("purchase_orders")
    .select("total_cost")
    .eq("job_id", jobId);

  const poTotal = (pos || []).reduce((sum: number, po: any) => sum + (po.total_cost || 0), 0);

  // Get invoice total
  const { data: invoices } = await supabase
    .from("supplier_invoices")
    .select("amount")
    .in("po_id", (pos || []).map((po: any) => po.id));

  const invoiceTotal = (invoices || []).reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);

  const variance = invoiceTotal - poTotal;
  const variancePercent = poTotal > 0 ? (variance / poTotal * 100) : 0;

  return {
    estimated_cost: estimatedCost,
    po_total_cost: poTotal,
    invoice_total: invoiceTotal,
    variance,
    variance_percent: variancePercent,
  };
}

























