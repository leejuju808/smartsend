// Block 26200 — SmartSend Roofing AR/AP Collections Engine v1
// Collections Engine Edge Function
// Finds overdue + soon-due invoices and creates collections tasks + enqueues email reminders

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (_req: Request) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1) Refresh overdue statuses
    const { error: markError } = await supabase.rpc("mark_overdue_invoices");
    if (markError) {
      console.error("Error marking overdue invoices:", markError);
      return new Response(
        JSON.stringify({ error: markError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const today = new Date();
    const soon = new Date();
    soon.setDate(today.getDate() + 3);

    // 2) Find invoices that need collections attention
    const { data: invoices, error } = await supabase
      .from("roofing_invoice_balances")
      .select("*")
      .or("status.eq.overdue,status.eq.sent,status.eq.partial")
      .gt("balance_due", 0)
      .lte("due_date", soon.toISOString().split("T")[0]);

    if (error) {
      console.error("Error fetching invoices:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!invoices || invoices.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No invoices need collections attention",
          processed: 0 
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let emailsEnqueued = 0;
    let tasksCreated = 0;
    const errors: string[] = [];

    // 3) Process each invoice
    for (const inv of invoices) {
      if (!inv.payer_email || !inv.workspace_id) continue;

      const subject =
        inv.status === "overdue"
          ? `Past Due: Invoice ${inv.invoice_number || inv.invoice_id.slice(0, 8)} for your roof project`
          : `Reminder: Upcoming payment for your roof project`;

      const body = `
Hi ${inv.payer_name || ""},

This is a friendly reminder about your roofing project balance.

Total invoice: $${Number(inv.invoice_amount).toFixed(2)}
Paid so far: $${Number(inv.amount_paid).toFixed(2)}
Remaining balance: $${Number(inv.balance_due).toFixed(2)}
Due date: ${inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "Not specified"}

Please complete your payment to keep your project on schedule.
Reply to this email if you have any questions.

Thank you!
`;

      // Try to find a lead_id or contact_id from the job
      let leadId: string | null = null;
      let contactId: string | null = null;
      
      if (inv.job_id) {
        const { data: job } = await supabase
          .from("roofing_jobs")
          .select("lead_id, contact_id")
          .eq("id", inv.job_id)
          .single();
        
        if (job) {
          leadId = job.lead_id;
          contactId = job.contact_id;
        }
      }

      // Enqueue email reminder (using send_queue if it exists, or create a simple task)
      // Check if send_queue table exists and has the right structure
      try {
        // Try to insert into send_queue (may need to adapt based on your send_queue schema)
        const { error: queueError } = await supabase
          .from("send_queue")
          .insert({
            to_email: inv.payer_email,
            subject,
            body,
            state: "queued",
            scheduled_at: new Date().toISOString(),
            metadata: {
              type: "collections",
              invoice_id: inv.invoice_id,
              job_id: inv.job_id,
              payer_type: inv.payer_type,
            },
          });

        if (queueError) {
          console.warn(`Could not enqueue email for invoice ${inv.invoice_id}:`, queueError.message);
          // Fallback: create a task instead
        } else {
          emailsEnqueued++;
        }
      } catch (e) {
        console.warn(`Send queue not available, creating task instead:`, e);
      }

      // Create a collections call task
      try {
        const { error: taskError } = await supabase
          .from("tasks")
          .insert({
            workspace_id: inv.workspace_id,
            lead_id: leadId,
            title: `Call ${inv.payer_name || inv.payer_email} about invoice balance`,
            description: `Invoice ${inv.invoice_number || inv.invoice_id.slice(0, 8)}: Balance $${Number(inv.balance_due).toFixed(2)} due ${inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "ASAP"}`,
            status: "todo",
            due_date: inv.due_date || new Date().toISOString().split("T")[0],
            type: "collections_call",
            priority: inv.status === "overdue" ? "high" : "medium",
            metadata: {
              invoice_id: inv.invoice_id,
              job_id: inv.job_id,
              payer_type: inv.payer_type,
              balance_due: inv.balance_due,
            },
          });

        if (taskError) {
          errors.push(`Task creation failed for invoice ${inv.invoice_id}: ${taskError.message}`);
        } else {
          tasksCreated++;
        }
      } catch (e: any) {
        errors.push(`Task creation exception for invoice ${inv.invoice_id}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: invoices.length,
        emails_enqueued: emailsEnqueued,
        tasks_created: tasksCreated,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Collections engine error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});



































