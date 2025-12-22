// Block 24340 — Supplier Communication Engine
// Cron Job: Send Delivery Reminders (24 hours before delivery)
// Runs every hour to check for orders needing reminders

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gmailSendThroughWorkspace } from "@/lib/providers/gmail/send";

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get("key");

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Use service role for cron job
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find orders with delivery dates tomorrow that haven't had reminders sent
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const { data: reminders, error: remindersError } = await supabase
      .from("supplier_delivery_reminders")
      .select(`
        *,
        material_orders (
          *,
          suppliers (*),
          roofing_jobs (*)
        )
      `)
      .eq("status", "pending")
      .eq("expected_delivery_date", tomorrowStr);

    if (remindersError) {
      console.error("Error fetching reminders:", remindersError);
      return NextResponse.json(
        { error: "Failed to fetch reminders" },
        { status: 500 }
      );
    }

    if (!reminders || reminders.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: "No reminders to send",
      });
    }

    let processed = 0;
    let errors = 0;

    // Send reminders directly
    for (const reminder of reminders) {
      try {
        const order = (reminder as any).material_orders;
        if (!order || !order.suppliers || !order.suppliers.email) {
          continue;
        }

        const supplier = order.suppliers;
        const job = order.roofing_jobs;

        // Build email
        const subject = `Delivery Reminder — ${job.title || "Roofing Job"}`;
        
        const addressParts = [
          job.address,
          job.city,
          job.state,
          job.zip
        ].filter(Boolean);
        const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : "N/A";

        const deliveryDate = new Date(order.expected_delivery_date).toLocaleDateString();

        const body = `Hello ${supplier.contact_name || supplier.name},

Reminder that materials for the ${job.title || "roofing project"} at ${fullAddress} are scheduled for delivery tomorrow (${deliveryDate}).

Please confirm driver ETA and placement instructions.

Thank you,
SmartSend Automated System`;

        // Create communication record
        const { data: commData, error: commError } = await supabase
          .from("supplier_communications")
          .insert({
            workspace_id: order.workspace_id,
            material_order_id: order.id,
            supplier_id: order.supplier_id,
            job_id: order.job_id,
            communication_type: "delivery_reminder",
            subject,
            body,
            recipient_email: supplier.email,
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (commError) {
          console.error("Error creating communication record:", commError);
          errors++;
          continue;
        }

        // Send email
        try {
          await gmailSendThroughWorkspace(order.workspace_id, {
            to: supplier.email,
            subject,
            html: body.replace(/\n/g, "<br>"),
          });

          // Update reminder status
          await supabase
            .from("supplier_delivery_reminders")
            .update({
              reminder_sent_at: new Date().toISOString(),
              communication_id: commData.id,
              status: "sent",
              updated_at: new Date().toISOString(),
            })
            .eq("id", reminder.id);

          // Update communication status
          await supabase
            .from("supplier_communications")
            .update({
              status: "delivered",
              updated_at: new Date().toISOString(),
            })
            .eq("id", commData.id);

          processed++;
        } catch (emailError: any) {
          console.error("Error sending email:", emailError);
          
          await supabase
            .from("supplier_communications")
            .update({
              status: "failed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", commData.id);

          errors++;
        }
      } catch (error: any) {
        errors++;
        console.error(`Error processing reminder ${reminder.id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      errors,
      total: reminders.length,
    });
  } catch (error: any) {
    console.error("Error in supplier-delivery-reminders cron:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

