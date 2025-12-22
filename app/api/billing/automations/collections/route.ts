import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * POST /api/billing/automations/collections
 * Run collections automation - send reminders for overdue invoices
 * This should be called by a cron job (e.g., every hour)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Verify cron secret if provided
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Mark overdue invoices
    await supabase.rpc("mark_overdue_invoices");

    // Get all unpaid/partial invoices that are overdue or due soon
    const today = new Date().toISOString().split('T')[0];
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Get invoices that need reminders
    const { data: invoicesNeedingReminders } = await supabase
      .from("invoices")
      .select("*")
      .in("status", ["unpaid", "partial", "overdue"])
      .lt("due_date", threeDaysFromNow)
      .gt("balance", 0);

    if (!invoicesNeedingReminders || invoicesNeedingReminders.length === 0) {
      return NextResponse.json({
        processed: 0,
        message: "No invoices need reminders",
      });
    }

    const results = [];

    for (const invoice of invoicesNeedingReminders) {
      const daysOverdue = Math.floor(
        (new Date().getTime() - new Date(invoice.due_date).getTime()) /
          (1000 * 60 * 60 * 24)
      );

      // Check if we've already sent a reminder recently (within last 24 hours)
      const { data: recentEvents } = await supabase
        .from("collections_events")
        .select("id")
        .eq("invoice_id", invoice.id)
        .gte("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (recentEvents && recentEvents.length > 0) {
        continue; // Skip if reminder sent recently
      }

      // Determine event type and message based on days overdue
      let eventType = "reminder_sent";
      let message = "";

      if (daysOverdue >= 10) {
        eventType = "escalation";
        message = `This invoice is significantly past due (${daysOverdue} days). Your project may be paused if payment is not received. Please submit payment of $${invoice.balance.toFixed(2)} immediately.`;
      } else if (daysOverdue >= 3) {
        eventType = "overdue_notice";
        message = `Your invoice #${invoice.invoice_number} is past due (${daysOverdue} days). Please submit payment of $${invoice.balance.toFixed(2)} to avoid delays.`;
      } else if (daysOverdue >= 0) {
        eventType = "reminder_sent";
        message = `Your invoice #${invoice.invoice_number} is now due. Please complete your payment of $${invoice.balance.toFixed(2)}.`;
      } else {
        // Due soon (not yet due)
        eventType = "reminder_sent";
        message = `Your invoice #${invoice.invoice_number} is due soon (${Math.abs(daysOverdue)} day${Math.abs(daysOverdue) !== 1 ? "s" : ""}). Please complete your payment of $${invoice.balance.toFixed(2)}.`;
      }

      // Create collections event
      const { data: event, error: eventError } = await supabase
        .from("collections_events")
        .insert({
          invoice_id: invoice.id,
          workspace_id: invoice.workspace_id,
          event_type: eventType,
          message,
          channel: "email",
          automated: true,
        })
        .select()
        .single();

      if (eventError) {
        console.error(`Error creating collections event for invoice ${invoice.id}:`, eventError);
        continue;
      }

      // If 10+ days overdue, also notify manager
      if (daysOverdue >= 10) {
        await supabase
          .from("collections_events")
          .insert({
            invoice_id: invoice.id,
            workspace_id: invoice.workspace_id,
            event_type: "manager_notification",
            message: `Invoice #${invoice.invoice_number} is ${daysOverdue} days overdue. Consider escalation.`,
            channel: "system",
            automated: true,
          });
      }

      // TODO: Actually send the email/SMS here
      // This would integrate with your email/SMS sending system
      // Example:
      // await sendEmail({
      //   to: customerEmail,
      //   subject: `Invoice ${invoice.invoice_number} ${daysOverdue > 0 ? 'Overdue' : 'Due Soon'}`,
      //   body: message
      // });

      results.push({
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        event_type: eventType,
        days_overdue: daysOverdue,
      });
    }

    return NextResponse.json({
      processed: results.length,
      results,
      message: `Processed ${results.length} collection reminders`,
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/automations/collections:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}






















