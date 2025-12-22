// Block 240000 — SmartSend Roofing Billing & Payments Hub
// POST /api/billing/automations/invoice-auto-send
// Automation: Auto-send invoices based on job milestones

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const body = await req.json();
    const { job_id, milestone_type } = body; // milestone_type: 'contract_signed', 'job_started', 'job_completed'

    if (!job_id || !milestone_type) {
      return NextResponse.json(
        { error: "Missing required fields: job_id, milestone_type" },
        { status: 400 }
      );
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select(`
        *,
        leads:lead_id (
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Determine invoice type based on milestone
    let invoiceType = "deposit";
    if (milestone_type === "job_started") {
      invoiceType = "progress";
    } else if (milestone_type === "job_completed") {
      invoiceType = "final";
    }

    // Check if invoice already exists for this milestone
    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("*")
      .eq("job_id", job_id)
      .eq("type", invoiceType)
      .maybeSingle();

    if (existingInvoice) {
      return NextResponse.json({
        success: true,
        message: "Invoice already exists for this milestone",
        invoice_id: existingInvoice.id,
      });
    }

    // Get payment schedule if exists
    const { data: paymentSchedule } = await supabase
      .from("payment_schedules")
      .select("*")
      .eq("job_id", job_id)
      .single();

    let invoiceAmount = 0;
    if (paymentSchedule) {
      // Calculate amount based on schedule
      // This would depend on your payment schedule structure
    } else {
      // Use contract value
      invoiceAmount = Number(job.contract_value) || 0;
    }

    // Create invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        job_id,
        workspace_id: job.workspace_id,
        type: invoiceType,
        amount: invoiceAmount,
        status: "pending",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // 7 days from now
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

    // Auto-send invoice
    const sendResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/billing/invoice/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoice_id: invoice.id,
        send_via: "email",
      }),
    });

    if (!sendResponse.ok) {
      console.error("Failed to send invoice");
    }

    return NextResponse.json({
      success: true,
      invoice,
      sent: sendResponse.ok,
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/automations/invoice-auto-send:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























