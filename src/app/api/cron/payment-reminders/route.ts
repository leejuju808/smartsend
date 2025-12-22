import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabase/server";
import { sendHtmlEmail } from "@/lib/notify/mailer";

function authorize(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  return key && key === process.env.CRON_SECRET;
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get pending invoices
  const { data: invoices, error: invoicesError } = await supabase
    .from("invoices")
    .select(`
      id,
      job_id,
      amount,
      due_date,
      status,
      stripe_payment_link,
      jobs (
        id,
        lead_id,
        leads (
          id,
          first_name,
          last_name,
          email,
          phone
        )
      )
    `)
    .in("status", ["pending", "partially_paid"])
    .not("due_date", "is", null)
    .not("stripe_payment_link", "is", null);

  if (invoicesError) {
    console.error("Error fetching invoices:", invoicesError);
    return NextResponse.json(
      { error: "Failed to fetch invoices", details: invoicesError.message },
      { status: 500 }
    );
  }

  if (!invoices || invoices.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: "No invoices to process" });
  }

  let remindersSent = 0;
  let errors = 0;

  for (const invoice of invoices) {
    try {
      if (!invoice.due_date) continue;

      const dueDate = new Date(invoice.due_date);
      dueDate.setHours(0, 0, 0, 0);

      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Only send reminders at specific intervals: 3 days before, day of, 3 days after
      if (diffDays !== 3 && diffDays !== 0 && diffDays !== -3) {
        continue;
      }

      const job = invoice.jobs as any;
      const lead = job?.leads as any;

      if (!lead || !lead.email) {
        console.warn(`No email found for invoice ${invoice.id}`);
        continue;
      }

      // Check if we already sent a reminder today for this invoice
      const { data: existingReminder } = await supabase
        .from("collections_tasks")
        .select("id")
        .eq("invoice_id", invoice.id)
        .gte("created_at", today.toISOString())
        .ilike("description", "%reminder%")
        .maybeSingle();

      if (existingReminder) {
        continue; // Already sent reminder today
      }

      // Build reminder message
      const customerName = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "there";
      let subject = "";
      let message = "";

      if (diffDays === 3) {
        subject = `Friendly Reminder: Payment Due in 3 Days`;
        message = `Hi ${customerName}, just a friendly reminder that your roofing payment of $${invoice.amount?.toFixed(2)} is due in 3 days (${dueDate.toLocaleDateString()}). You can pay securely using this link: ${invoice.stripe_payment_link}`;
      } else if (diffDays === 0) {
        subject = `Payment Due Today`;
        message = `Hi ${customerName}, your roofing payment of $${invoice.amount?.toFixed(2)} is due today. You can pay securely using this link: ${invoice.stripe_payment_link}`;
      } else if (diffDays === -3) {
        subject = `Payment Now Past Due`;
        message = `Hi ${customerName}, your roofing payment of $${invoice.amount?.toFixed(2)} is now past due. Please complete payment today to avoid delays: ${invoice.stripe_payment_link}`;
      }

      if (!message) continue;

      // Send email
      try {
        await sendHtmlEmail({
          to: lead.email,
          subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <p>${message.replace(/\n/g, "<br>")}</p>
              <p style="margin-top: 20px;">
                <a href="${invoice.stripe_payment_link}" 
                   style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">
                  Pay Now
                </a>
              </p>
              <p style="margin-top: 20px; font-size: 12px; color: #666;">
                If you have any questions, please don't hesitate to reach out.
              </p>
            </div>
          `,
        });

        // Create collections task to track reminder
        await supabase.from("collections_tasks").insert({
          invoice_id: invoice.id,
          description: `Payment reminder sent (${diffDays === 3 ? "3 days before" : diffDays === 0 ? "due today" : "3 days overdue"})`,
          completed: true,
          completed_at: new Date().toISOString(),
        });

        remindersSent++;
      } catch (emailError: any) {
        console.error(`Error sending email for invoice ${invoice.id}:`, emailError);
        errors++;
      }

      // TODO: Send SMS if phone number is available
      // if (lead.phone) {
      //   // Integrate with SMS service (Twilio, Vonage, etc.)
      // }

    } catch (error: any) {
      console.error(`Error processing invoice ${invoice.id}:`, error);
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    processed: invoices.length,
    remindersSent,
    errors,
  });
}

































