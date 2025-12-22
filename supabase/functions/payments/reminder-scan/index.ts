// Block 58000 — SmartSend Roofing "Financing Options + Payment Plan System" v1
// Edge Function: payments/reminder-scan
// Daily cron job to scan for due/late payments and send reminders

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const results = {
      day_before_reminders: 0,
      day_of_reminders: 0,
      day_after_reminders: 0,
      weekly_late_reminders: 0,
      errors: [] as string[],
    };

    // 1. Day before due (due_date = tomorrow)
    const { data: dayBeforePayments, error: dayBeforeError } = await supabase
      .from("payment_plan_payments")
      .select(`
        *,
        payment_plans (
          id,
          homeowner_id,
          job_id,
          proposal_id,
          workspace_id
        )
      `)
      .eq("paid", false)
      .eq("due_date", tomorrowStr)
      .is("reminder_sent_at", null);

    if (!dayBeforeError && dayBeforePayments) {
      for (const payment of dayBeforePayments) {
        // Check if reminder already sent today
        const { data: existingReminder } = await supabase
          .from("payment_reminders")
          .select("id")
          .eq("payment_id", payment.id)
          .eq("reminder_type", "day_before")
          .gte("sent_at", todayStr)
          .single();

        if (!existingReminder && payment.payment_plans) {
          // Send reminder (in real implementation, this would send email/SMS)
          const { error: reminderError } = await supabase
            .from("payment_reminders")
            .insert({
              payment_id: payment.id,
              plan_id: payment.payment_plans.id,
              reminder_type: "day_before",
              channel: "email", // Could be determined by homeowner preferences
              status: "sent",
            });

          if (!reminderError) {
            await supabase
              .from("payment_plan_payments")
              .update({
                reminder_sent_at: new Date().toISOString(),
                reminder_count: (payment.reminder_count || 0) + 1,
              })
              .eq("id", payment.id);

            results.day_before_reminders++;
          } else {
            results.errors.push(`Failed to send day_before reminder for payment ${payment.id}`);
          }
        }
      }
    }

    // 2. Day of due (due_date = today)
    const { data: dayOfPayments, error: dayOfError } = await supabase
      .from("payment_plan_payments")
      .select(`
        *,
        payment_plans (
          id,
          homeowner_id,
          job_id,
          proposal_id,
          workspace_id
        )
      `)
      .eq("paid", false)
      .eq("due_date", todayStr);

    if (!dayOfError && dayOfPayments) {
      for (const payment of dayOfPayments) {
        // Check if reminder already sent today
        const { data: existingReminder } = await supabase
          .from("payment_reminders")
          .select("id")
          .eq("payment_id", payment.id)
          .eq("reminder_type", "day_of")
          .gte("sent_at", todayStr)
          .single();

        if (!existingReminder && payment.payment_plans) {
          const { error: reminderError } = await supabase
            .from("payment_reminders")
            .insert({
              payment_id: payment.id,
              plan_id: payment.payment_plans.id,
              reminder_type: "day_of",
              channel: "email",
              status: "sent",
            });

          if (!reminderError) {
            await supabase
              .from("payment_plan_payments")
              .update({
                reminder_sent_at: new Date().toISOString(),
                reminder_count: (payment.reminder_count || 0) + 1,
              })
              .eq("id", payment.id);

            results.day_of_reminders++;
          } else {
            results.errors.push(`Failed to send day_of reminder for payment ${payment.id}`);
          }
        }
      }
    }

    // 3. Day after due (due_date = yesterday, still unpaid)
    const { data: dayAfterPayments, error: dayAfterError } = await supabase
      .from("payment_plan_payments")
      .select(`
        *,
        payment_plans (
          id,
          homeowner_id,
          job_id,
          proposal_id,
          workspace_id
        )
      `)
      .eq("paid", false)
      .eq("due_date", yesterdayStr);

    if (!dayAfterError && dayAfterPayments) {
      for (const payment of dayAfterPayments) {
        const { data: existingReminder } = await supabase
          .from("payment_reminders")
          .select("id")
          .eq("payment_id", payment.id)
          .eq("reminder_type", "day_after")
          .gte("sent_at", todayStr)
          .single();

        if (!existingReminder && payment.payment_plans) {
          const { error: reminderError } = await supabase
            .from("payment_reminders")
            .insert({
              payment_id: payment.id,
              plan_id: payment.payment_plans.id,
              reminder_type: "day_after",
              channel: "email",
              status: "sent",
            });

          if (!reminderError) {
            await supabase
              .from("payment_plan_payments")
              .update({
                reminder_sent_at: new Date().toISOString(),
                reminder_count: (payment.reminder_count || 0) + 1,
              })
              .eq("id", payment.id);

            results.day_after_reminders++;
          } else {
            results.errors.push(`Failed to send day_after reminder for payment ${payment.id}`);
          }
        }
      }
    }

    // 4. Weekly late reminders (overdue by 7+ days, send weekly)
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    const { data: latePayments, error: lateError } = await supabase
      .from("payment_plan_payments")
      .select(`
        *,
        payment_plans (
          id,
          homeowner_id,
          job_id,
          proposal_id,
          workspace_id
        )
      `)
      .eq("paid", false)
      .lt("due_date", weekAgoStr);

    if (!lateError && latePayments) {
      for (const payment of latePayments) {
        // Check if weekly reminder sent in last 7 days
        const { data: existingReminder } = await supabase
          .from("payment_reminders")
          .select("id")
          .eq("payment_id", payment.id)
          .eq("reminder_type", "weekly_late")
          .gte("sent_at", weekAgoStr)
          .single();

        if (!existingReminder && payment.payment_plans) {
          const { error: reminderError } = await supabase
            .from("payment_reminders")
            .insert({
              payment_id: payment.id,
              plan_id: payment.payment_plans.id,
              reminder_type: "weekly_late",
              channel: "email",
              status: "sent",
            });

          if (!reminderError) {
            await supabase
              .from("payment_plan_payments")
              .update({
                reminder_sent_at: new Date().toISOString(),
                reminder_count: (payment.reminder_count || 0) + 1,
              })
              .eq("id", payment.id);

            results.weekly_late_reminders++;
          } else {
            results.errors.push(`Failed to send weekly_late reminder for payment ${payment.id}`);
          }
        }
      }
    }

    // Update payment plan statuses for overdue plans
    await supabase
      .from("payment_plans")
      .update({ status: "delinquent", updated_at: new Date().toISOString() })
      .in("id", 
        (await supabase
          .from("payment_plan_payments")
          .select("plan_id")
          .eq("paid", false)
          .lt("due_date", todayStr)
        ).data?.map(p => p.plan_id) || []
      )
      .eq("status", "active");

    return new Response(
      JSON.stringify({
        ok: true,
        date: todayStr,
        results,
        total_reminders: 
          results.day_before_reminders + 
          results.day_of_reminders + 
          results.day_after_reminders + 
          results.weekly_late_reminders,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("Error in reminder scan:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});

