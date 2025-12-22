import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * POST /api/billing/receipts/send
 * Automatically send receipt after payment is recorded
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { payment_id } = body;

    if (!payment_id) {
      return NextResponse.json(
        { error: "Payment ID is required" },
        { status: 400 }
      );
    }

    // Get payment details
    const { data: payment } = await supabase
      .from("payments")
      .select(`
        *,
        invoices!inner(
          id,
          invoice_number,
          job_id,
          customer_id,
          homeowner_name,
          homeowner_email
        )
      `)
      .eq("id", payment_id)
      .single();

    if (!payment || !payment.invoices) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    const invoice = payment.invoices;

    // Generate receipt message
    const receiptMessage = `Thank you! We have received your payment of $${payment.amount.toFixed(2)}.

Invoice: ${invoice.invoice_number}
Payment Method: ${payment.method}
Date: ${new Date(payment.date).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })}

Receipt attached.

Thank you for your business!`;

    // TODO: Generate PDF receipt and attach it
    // This would integrate with a PDF generation library
    // Example:
    // const receiptPdf = await generateReceiptPdf(payment, invoice);

    // TODO: Send email with receipt
    // This would integrate with your email sending system
    // Example:
    // await sendEmail({
    //   to: invoice.homeowner_email,
    //   subject: `Receipt - Payment for Invoice ${invoice.invoice_number}`,
    //   body: receiptMessage,
    //   attachments: [{ filename: 'receipt.pdf', content: receiptPdf }]
    // });

    return NextResponse.json({
      success: true,
      message: "Receipt sent successfully",
      receipt_message: receiptMessage,
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/receipts/send:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}






















