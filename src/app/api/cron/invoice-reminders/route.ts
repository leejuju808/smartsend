// Block 39200 — SmartSend Roofing Invoice Engine
// GET /api/cron/invoice-reminders
// Send payment reminders for invoices (Day 1, 3, 7, 14)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const results = {
      reminders_sent: 0,
      errors: [] as string[],
    };

    // Get pending reminders that are due
    const { data: reminders, error: remindersError } = await supabase
      .from("invoice_payment_reminders")
      .select(`
        id,
        invoice_id,
        reminder_day,
        scheduled_at,
        invoices:invoice_id (
          id,
          balance_due,
          status,
          due_date,
          last_reminder_sent_at,
          reminder_count,
          lead_id,
          workspace_id,
          leads:lead_id (
            phone,
            first_name,
            last_name,
            email
          )
        )
      `)
      .is("sent_at", null)
      .lte("scheduled_at", now.toISOString())
      .limit(100); // Process in batches

    if (remindersError) {
      console.error("Error fetching reminders:", remindersError);
      return NextResponse.json(
        { error: "Failed to fetch reminders" },
        { status: 500 }
      );
    }

    if (!reminders || reminders.length === 0) {
      return NextResponse.json({
        message: "No reminders to send",
        results,
      });
    }

    // Process each reminder
    for (const reminder of reminders) {
      const invoice = reminder.invoices as any;
      if (!invoice || invoice.status === "paid" || invoice.balance_due <= 0) {
        // Mark reminder as skipped
        await supabase
          .from("invoice_payment_reminders")
          .update({ sent_at: now.toISOString() })
          .eq("id", reminder.id);
        continue;
      }

      const lead = invoice.leads as any;
      if (!lead?.phone) {
        results.errors.push(`Invoice ${invoice.id}: No phone number for lead`);
        continue;
      }

      // Get workspace SMS config
      const { data: workspaceSettings } = await supabase
        .from("workspace_settings")
        .select("settings")
        .eq("workspace_id", invoice.workspace_id)
        .single();

      const smsConfig = workspaceSettings?.settings?.sms;
      const vonageUrl = process.env.VONAGE_SMS_URL || smsConfig?.api_url;

      if (!vonageUrl) {
        results.errors.push(
          `Invoice ${invoice.id}: SMS not configured for workspace`
        );
        continue;
      }

      // Build reminder message based on day
      const portalUrl =
        process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
      const paymentUrl = `${portalUrl}/pay/${invoice.id}`;
      const balance = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(Number(invoice.balance_due));

      let message = "";
      if (reminder.reminder_day === 1) {
        message = `Hi ${lead.first_name || "there"}, your roofing invoice is ready. Balance: ${balance}. Pay securely here: ${paymentUrl}`;
      } else if (reminder.reminder_day === 3) {
        message = `Hi ${lead.first_name || "there"}, just a reminder — your invoice for ${balance} is ready. Pay here: ${paymentUrl}`;
      } else if (reminder.reminder_day === 7) {
        message = `Hi ${lead.first_name || "there"}, final polite reminder — your invoice for ${balance} is due. Pay here: ${paymentUrl}`;
      } else if (reminder.reminder_day === 14) {
        message = `Hi ${lead.first_name || "there"}, your invoice for ${balance} is now overdue. Please pay immediately: ${paymentUrl}`;
        
        // Mark invoice as overdue if not already
        if (invoice.status !== "overdue") {
          await supabase
            .from("invoices")
            .update({ status: "overdue" })
            .eq("id", invoice.id);
          
          // Log overdue event
          await supabase.from("invoice_events").insert({
            invoice_id: invoice.id,
            event: "overdue",
            metadata: { reminder_day: reminder.reminder_day },
          });
        }
      }

      // Send SMS
      try {
        const smsResponse = await fetch(vonageUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: lead.phone,
            text: message,
          }),
        });

        if (smsResponse.ok) {
          // Mark reminder as sent
          await supabase
            .from("invoice_payment_reminders")
            .update({ sent_at: now.toISOString(), message_text: message })
            .eq("id", reminder.id);

          // Update invoice reminder tracking
          await supabase
            .from("invoices")
            .update({
              last_reminder_sent_at: now.toISOString(),
              reminder_count: (invoice.reminder_count || 0) + 1,
            })
            .eq("id", invoice.id);

          // Log reminder sent event
          await supabase.from("invoice_events").insert({
            invoice_id: invoice.id,
            event: "reminder_sent",
            metadata: {
              reminder_day: reminder.reminder_day,
              method: "sms",
            },
          });

          results.reminders_sent++;
        } else {
          results.errors.push(
            `Invoice ${invoice.id}: SMS send failed (${smsResponse.status})`
          );
        }
      } catch (smsError: any) {
        results.errors.push(
          `Invoice ${invoice.id}: SMS error - ${smsError.message}`
        );
      }
    }

    // Also mark overdue invoices
    await supabase.rpc("mark_overdue_invoices");

    return NextResponse.json({
      message: "Reminders processed",
      results,
    });
  } catch (error: any) {
    console.error("Error in invoice reminders cron:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































