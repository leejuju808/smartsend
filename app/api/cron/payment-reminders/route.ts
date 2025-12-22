import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/cron/payment-reminders
 * Automated payment reminder system
 * Runs daily to send reminders for:
 * - Due Date - 3 days: Friendly reminder
 * - Due Date - 1 day: Invoice due tomorrow
 * - Due Date + 1 day: Invoice overdue
 */
export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const keyParam = new URL(req.url).searchParams.get("key");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && keyParam !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate dates
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);

    const oneDayFromNow = new Date(today);
    oneDayFromNow.setDate(today.getDate() + 1);

    const oneDayAgo = new Date(today);
    oneDayAgo.setDate(today.getDate() - 1);

    // Find invoices that need reminders
    const { data: invoices, error: invoicesError } = await supabase
      .from("invoices")
      .select("*")
      .in("status", ["pending", "partial"])
      .not("due_date", "is", null)
      .lte("due_date", threeDaysFromNow.toISOString().split("T")[0])
      .gt("due_date", oneDayAgo.toISOString().split("T")[0]);

    if (invoicesError) {
      console.error("Error fetching invoices:", invoicesError);
      return NextResponse.json(
        { error: "Failed to fetch invoices" },
        { status: 500 }
      );
    }

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({
        message: "No invoices need reminders",
        processed: 0,
      });
    }

    let processed = 0;
    const reminders: any[] = [];

    for (const invoice of invoices) {
      if (!invoice.due_date) continue;

      const dueDate = new Date(invoice.due_date);
      dueDate.setHours(0, 0, 0, 0);

      const daysUntilDue = Math.floor(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      let reminderType: "due_soon" | "due_tomorrow" | "overdue" | null = null;
      let shouldSend = false;

      // Check if reminder already sent today
      const { data: existingReminder } = await supabase
        .from("payment_reminders")
        .select("*")
        .eq("invoice_id", invoice.id)
        .gte("sent_at", today.toISOString())
        .single();

      if (existingReminder) {
        continue; // Already sent reminder today
      }

      if (daysUntilDue === 3) {
        reminderType = "due_soon";
        shouldSend = true;
      } else if (daysUntilDue === 1) {
        reminderType = "due_tomorrow";
        shouldSend = true;
      } else if (daysUntilDue === -1) {
        reminderType = "overdue";
        shouldSend = true;
      }

      if (shouldSend && reminderType) {
        // Create reminder record
        const { error: reminderError } = await supabase
          .from("payment_reminders")
          .insert({
            invoice_id: invoice.id,
            reminder_type: reminderType,
            email_sent: false, // Will be sent via email service
            sent_at: new Date().toISOString(),
          });

        if (!reminderError) {
          reminders.push({
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            homeowner_email: invoice.homeowner_email,
            homeowner_name: invoice.homeowner_name,
            reminder_type: reminderType,
            days_until_due: daysUntilDue,
            amount_due: invoice.amount_due - invoice.amount_paid,
          });
          processed++;
        }
      }

      // Mark overdue invoices
      if (daysUntilDue < 0 && invoice.status !== "overdue") {
        await supabase
          .from("invoices")
          .update({ status: "overdue" })
          .eq("id", invoice.id);
      }
    }

    // TODO: Send actual email reminders via your email service
    // For now, we just log them
    console.log(`Processed ${processed} payment reminders:`, reminders);

    return NextResponse.json({
      message: "Payment reminders processed",
      processed,
      reminders,
    });
  } catch (error: any) {
    console.error("Error processing payment reminders:", error);
    return NextResponse.json(
      { error: "Failed to process reminders", details: error.message },
      { status: 500 }
    );
  }
}



























