// Block 39200 — SmartSend Roofing Invoice Engine
// POST /api/invoices/generate
// Auto-generate invoice when job is completed

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, invoice_type = "final" } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        workspace_id,
        lead_id,
        job_value,
        deposit_paid,
        status
      `)
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("workspace_id", job.workspace_id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Get lead details for invoice
    const { data: lead } = await supabase
      .from("leads")
      .select("id, email, phone, first_name, last_name")
      .eq("id", job.lead_id)
      .single();

    // Calculate change order adjustments
    const { data: changeOrders } = await supabase
      .from("roofing_change_order_revenue")
      .select("amount")
      .eq("job_id", job_id)
      .eq("approved", true);

    const changeOrderTotal = changeOrders?.reduce(
      (sum, co) => sum + Number(co.amount || 0),
      0
    ) || 0;

    // Calculate balance due
    const totalAmount = Number(job.job_value || 0) + changeOrderTotal;
    const depositPaid = Number(job.deposit_paid || 0);
    const balanceDue = Math.max(totalAmount - depositPaid, 0);

    // Only create invoice if there's a balance due
    if (balanceDue <= 0) {
      return NextResponse.json(
        { error: "No balance due for this job" },
        { status: 400 }
      );
    }

    // Generate invoice number
    const { data: invoiceNumber } = await supabase.rpc("generate_invoice_number", {
      p_team_id: null,
      p_workspace_id: job.workspace_id,
    });

    // Create invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        roofing_job_id: job_id,
        lead_id: job.lead_id,
        workspace_id: job.workspace_id,
        invoice_number: invoiceNumber || `INV-${Date.now()}`,
        type: invoice_type,
        amount: totalAmount,
        balance_due: balanceDue,
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        status: "pending",
      })
      .select()
      .single();

    if (invoiceError || !invoice) {
      console.error("Error creating invoice:", invoiceError);
      return NextResponse.json(
        { error: "Failed to create invoice" },
        { status: 500 }
      );
    }

    // Log invoice created event
    await supabase.from("invoice_events").insert({
      invoice_id: invoice.id,
      event: "created",
      metadata: {
        job_id,
        job_value: job.job_value,
        change_order_total: changeOrderTotal,
        deposit_paid: depositPaid,
        balance_due: balanceDue,
      },
    });

    // Schedule payment reminders
    await supabase.rpc("schedule_payment_reminders", {
      p_invoice_id: invoice.id,
    });

    // Send invoice to homeowner via SMS if phone available
    if (lead?.phone) {
      const portalUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
      const paymentUrl = `${portalUrl}/pay/${invoice.id}`;
      const message = `Hi ${lead.first_name || "there"}, your roofing invoice is ready. Pay securely here: ${paymentUrl}`;

      // Get SMS config from workspace settings
      const { data: workspaceSettings } = await supabase
        .from("workspace_settings")
        .select("settings")
        .eq("workspace_id", job.workspace_id)
        .single();

      const smsConfig = workspaceSettings?.settings?.sms;
      const vonageUrl = process.env.VONAGE_SMS_URL || smsConfig?.api_url;

      if (vonageUrl) {
        try {
          await fetch(vonageUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: lead.phone,
              text: message,
            }),
          });

          // Mark invoice as sent
          await supabase
            .from("invoices")
            .update({ sent_at: new Date().toISOString() })
            .eq("id", invoice.id);

          // Log sent event
          await supabase.from("invoice_events").insert({
            invoice_id: invoice.id,
            event: "sent",
            metadata: { method: "sms", phone: lead.phone },
          });
        } catch (smsError) {
          console.error("Failed to send SMS:", smsError);
          // Don't fail the request if SMS fails
        }
      }
    }

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error: any) {
    console.error("Error generating invoice:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































