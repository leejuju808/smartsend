import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/mailer";

/**
 * POST /api/cron/ar-reminders
 * Automated late payment reminder system
 * Runs daily to check for overdue invoices and send reminders
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Update overdue invoices
    await supabase.rpc("update_overdue_invoices");

    // Get all unpaid/partially paid invoices
    const { data: invoices } = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        total_amount,
        remaining_balance,
        due_date,
        status,
        customers (
          id,
          name,
          email
        ),
        jobs (
          id
        )
      `)
      .in("status", ["unpaid", "partially_paid", "overdue"]);

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ message: "No invoices to process", sent: 0 });
    }

    const today = new Date();
    let sentCount = 0;

    for (const invoice of invoices) {
      const dueDate = new Date(invoice.due_date);
      const daysOverdue = Math.floor(
        (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Determine followup type based on days overdue
      let followupType: string | null = null;
      if (daysOverdue === 0) {
        followupType = "reminder"; // Due today
      } else if (daysOverdue === 7) {
        followupType = "overdue_7";
      } else if (daysOverdue === 14) {
        followupType = "overdue_14";
      } else if (daysOverdue === 30) {
        followupType = "overdue_30";
      } else if (daysOverdue > 30) {
        followupType = "final_notice";
      }

      if (!followupType) continue;

      // Check if followup already sent for this type
      const { data: existingFollowup } = await supabase
        .from("ar_followups")
        .select("id")
        .eq("invoice_id", invoice.id)
        .eq("followup_type", followupType)
        .eq("status", "completed")
        .single();

      if (existingFollowup) continue; // Already sent

      const customer = invoice.customers as any;
      if (!customer?.email) continue; // No email to send to

      // Create followup record
      const { data: followup } = await supabase
        .from("ar_followups")
        .insert({
          team_id: (invoice as any).team_id,
          invoice_id: invoice.id,
          followup_type: followupType,
          next_step: getNextStepMessage(followupType),
          due_date: today.toISOString().split("T")[0],
          status: "pending",
        })
        .select()
        .single();

      if (!followup) continue;

      // Send email reminder
      const emailSubject = getEmailSubject(followupType, invoice.invoice_number);
      const emailBody = getEmailBody(
        followupType,
        invoice.invoice_number,
        invoice.remaining_balance,
        daysOverdue
      );

      try {
        await sendEmail({
          to: customer.email,
          subject: emailSubject,
          html: emailBody,
        });

        // Mark followup as sent
        await supabase
          .from("ar_followups")
          .update({
            status: "completed",
            auto_sent: true,
            sent_at: new Date().toISOString(),
            email_sent_to: customer.email,
          })
          .eq("id", followup.id);

        sentCount++;
      } catch (emailError) {
        console.error(
          `Error sending reminder for invoice ${invoice.id}:`,
          emailError
        );
      }
    }

    return NextResponse.json({
      message: "AR reminders processed",
      sent: sentCount,
      total_invoices: invoices.length,
    });
  } catch (error: any) {
    console.error("Error in AR reminders cron:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

function getNextStepMessage(followupType: string): string {
  switch (followupType) {
    case "reminder":
      return "Friendly reminder - invoice is due today";
    case "overdue_7":
      return "Invoice is 7 days overdue - please contact customer";
    case "overdue_14":
      return "Invoice is 14 days overdue - send past-due notice";
    case "overdue_30":
      return "Invoice is 30 days overdue - final notice required";
    case "final_notice":
      return "Invoice is over 30 days overdue - escalate to collections";
    default:
      return "Follow up on invoice payment";
  }
}

function getEmailSubject(followupType: string, invoiceNumber: string): string {
  switch (followupType) {
    case "reminder":
      return `Reminder: Invoice ${invoiceNumber} is Due Today`;
    case "overdue_7":
      return `Invoice ${invoiceNumber} is Now Overdue`;
    case "overdue_14":
      return `Past Due Notice: Invoice ${invoiceNumber}`;
    case "overdue_30":
      return `Final Notice: Invoice ${invoiceNumber}`;
    case "final_notice":
      return `URGENT: Invoice ${invoiceNumber} - Payment Required`;
    default:
      return `Invoice ${invoiceNumber} Payment Reminder`;
  }
}

function getEmailBody(
  followupType: string,
  invoiceNumber: string,
  amount: number,
  daysOverdue: number
): string {
  const amountFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);

  let message = "";
  switch (followupType) {
    case "reminder":
      message = `This is a friendly reminder that your invoice ${invoiceNumber} for ${amountFormatted} is due today. Please submit payment at your earliest convenience.`;
      break;
    case "overdue_7":
      message = `Your invoice ${invoiceNumber} for ${amountFormatted} is now 7 days overdue. Please contact us to arrange payment.`;
      break;
    case "overdue_14":
      message = `Your invoice ${invoiceNumber} for ${amountFormatted} is now 14 days past due. Please schedule payment immediately to avoid further action.`;
      break;
    case "overdue_30":
      message = `Your invoice ${invoiceNumber} for ${amountFormatted} is now 30 days past due. This is a final notice before account escalation.`;
      break;
    case "final_notice":
      message = `URGENT: Your invoice ${invoiceNumber} for ${amountFormatted} is over 30 days overdue. Please contact us immediately to resolve this matter.`;
      break;
  }

  return `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Invoice Payment Reminder</h2>
          <p>${message}</p>
          <p><strong>Invoice Number:</strong> ${invoiceNumber}</p>
          <p><strong>Amount Due:</strong> ${amountFormatted}</p>
          ${daysOverdue > 0 ? `<p><strong>Days Overdue:</strong> ${daysOverdue}</p>` : ""}
          <p>Thank you for your prompt attention to this matter.</p>
        </div>
      </body>
    </html>
  `;
}
