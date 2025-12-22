// Block 240000 — SmartSend Roofing Billing & Payments Hub
// POST /api/billing/automations/payment-reminders
// Automation: Send payment reminders for overdue invoices

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const body = await req.json();
    const { workspace_id, reminder_type } = body; // reminder_type: 'upcoming', 'due_today', 'overdue_3', etc.

    if (!workspace_id) {
      return NextResponse.json(
        { error: "Missing required field: workspace_id" },
        { status: 400 }
      );
    }

    // Get invoices that need reminders
    let query = supabase
      .from("invoices")
      .select(`
        *,
        jobs:job_id (
          id,
          lead_id,
          leads:lead_id (
            id,
            email,
            first_name,
            last_name,
            phone
          )
        )
      `)
      .eq("workspace_id", workspace_id)
      .in("status", ["pending", "partially_paid", "overdue"]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (reminder_type === "upcoming") {
      // 2 days before due date
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + 2);
      query = query.eq("due_date", targetDate.toISOString().split("T")[0]);
    } else if (reminder_type === "due_today") {
      query = query.eq("due_date", today.toISOString().split("T")[0]);
    } else if (reminder_type === "overdue_3") {
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      query = query
        .lt("due_date", today.toISOString().split("T")[0])
        .gte("due_date", threeDaysAgo.toISOString().split("T")[0]);
    } else if (reminder_type === "overdue_7") {
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      query = query
        .lt("due_date", threeDaysAgo.toISOString().split("T")[0])
        .gte("due_date", sevenDaysAgo.toISOString().split("T")[0]);
    } else if (reminder_type === "overdue_14") {
      const fourteenDaysAgo = new Date(today);
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      query = query
        .lt("due_date", sevenDaysAgo.toISOString().split("T")[0])
        .gte("due_date", fourteenDaysAgo.toISOString().split("T")[0]);
    }

    const { data: invoices, error } = await query;

    if (error) {
      console.error("Error fetching invoices:", error);
      return NextResponse.json(
        { error: "Failed to fetch invoices", details: error.message },
        { status: 500 }
      );
    }

    const sentReminders = [];

    // Send reminders for each invoice
    for (const invoice of invoices || []) {
      // Check if reminder was already sent today
      const { data: existingReminder } = await supabase
        .from("payment_reminders")
        .select("*")
        .eq("invoice_id", invoice.id)
        .eq("reminder_type", reminder_type)
        .gte("sent_at", today.toISOString())
        .maybeSingle();

      if (existingReminder) {
        continue; // Skip if already sent today
      }

      const lead = (invoice.jobs as any)?.leads;
      if (!lead || !lead.email) {
        continue; // Skip if no email
      }

      // Send email reminder
      // TODO: Integrate with email service
      console.log(`Sending ${reminder_type} reminder for invoice ${invoice.id} to ${lead.email}`);

      // Record reminder
      await supabase.from("payment_reminders").insert({
        invoice_id: invoice.id,
        homeowner_id: lead.id, // Assuming lead.id maps to homeowner
        reminder_type,
        sent_via: "email",
      });

      sentReminders.push({
        invoice_id: invoice.id,
        email: lead.email,
      });
    }

    return NextResponse.json({
      success: true,
      reminders_sent: sentReminders.length,
      reminders: sentReminders,
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/automations/payment-reminders:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























