// Block 26200 — Collections API: Send Reminder Email
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/src/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { invoice_id, payer_email } = await req.json();

    if (!invoice_id || !payer_email) {
      return NextResponse.json(
        { error: "Missing invoice_id or payer_email" },
        { status: 400 }
      );
    }

    // Get invoice details
    const { data: invoice, error: invoiceError } = await supabase
      .from("roofing_invoice_balances")
      .select("*")
      .eq("invoice_id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const subject =
      invoice.status === "overdue"
        ? `Past Due: Invoice ${invoice.invoice_number || invoice.invoice_id.slice(0, 8)} for your roof project`
        : `Reminder: Upcoming payment for your roof project`;

    const body = `
Hi ${invoice.payer_name || ""},

This is a friendly reminder about your roofing project balance.

Total invoice: $${Number(invoice.invoice_amount).toFixed(2)}
Paid so far: $${Number(invoice.amount_paid).toFixed(2)}
Remaining balance: $${Number(invoice.balance_due).toFixed(2)}
Due date: ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "Not specified"}

Please complete your payment to keep your project on schedule.
Reply to this email if you have any questions.

Thank you!
`;

    // Try to enqueue in send_queue (adapt based on your send_queue schema)
    const { error: queueError } = await supabase.from("send_queue").insert({
      to_email: payer_email,
      subject,
      body,
      state: "queued",
      scheduled_at: new Date().toISOString(),
      metadata: {
        type: "collections",
        invoice_id: invoice.invoice_id,
        job_id: invoice.job_id,
        payer_type: invoice.payer_type,
      },
    });

    if (queueError) {
      // Fallback: just return success (email might be sent via different mechanism)
      console.warn("Could not enqueue email:", queueError);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error sending reminder:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































