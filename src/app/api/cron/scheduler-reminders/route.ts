import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/cron/scheduler-reminders
 * Background worker to send appointment reminders
 * Should be called by cron job (e.g., every hour)
 * 
 * Sends:
 * - Booking confirmations (immediately after booking)
 * - Day-before reminders (24 hours before appointment)
 * - Hour-before reminders (1 hour before appointment)
 * - Post-inspection follow-ups (after appointment completion)
 * - No-show recovery (if marked no-show)
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret if needed
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    let processed = 0;

    // 1. Send booking confirmations (bookings created in last 5 minutes without confirmation)
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const { data: newBookings } = await supabase
      .from("schedule_bookings")
      .select(`
        id,
        workspace_id,
        homeowner_name,
        homeowner_email,
        homeowner_phone,
        start_time,
        property_address,
        appointment_type,
        confirmation_sent,
        scheduler_settings!inner(send_booking_confirmation)
      `)
      .eq("status", "booked")
      .eq("confirmation_sent", false)
      .gte("created_at", fiveMinutesAgo.toISOString())
      .limit(50);

    if (newBookings) {
      for (const booking of newBookings) {
        const settings = Array.isArray(booking.scheduler_settings)
          ? booking.scheduler_settings[0]
          : booking.scheduler_settings;

        if (settings?.send_booking_confirmation !== false) {
          await sendBookingConfirmation(supabase, booking);
          processed++;
        }
      }
    }

    // 2. Send day-before reminders
    const { data: dayBeforeBookings } = await supabase
      .from("schedule_bookings")
      .select(`
        id,
        workspace_id,
        homeowner_name,
        homeowner_email,
        homeowner_phone,
        start_time,
        property_address,
        appointment_type,
        reminder_sent_day_before,
        scheduler_settings!inner(send_day_before_reminder)
      `)
      .eq("status", "booked")
      .eq("reminder_sent_day_before", false)
      .gte("start_time", now.toISOString())
      .lte("start_time", oneDayFromNow.toISOString())
      .limit(50);

    if (dayBeforeBookings) {
      for (const booking of dayBeforeBookings) {
        const settings = Array.isArray(booking.scheduler_settings)
          ? booking.scheduler_settings[0]
          : booking.scheduler_settings;

        if (settings?.send_day_before_reminder !== false) {
          await sendDayBeforeReminder(supabase, booking);
          processed++;
        }
      }
    }

    // 3. Send hour-before reminders
    const { data: hourBeforeBookings } = await supabase
      .from("schedule_bookings")
      .select(`
        id,
        workspace_id,
        homeowner_name,
        homeowner_email,
        homeowner_phone,
        start_time,
        property_address,
        appointment_type,
        reminder_sent_hour_before,
        scheduler_settings!inner(send_hour_before_reminder)
      `)
      .eq("status", "booked")
      .eq("reminder_sent_hour_before", false)
      .gte("start_time", now.toISOString())
      .lte("start_time", oneHourFromNow.toISOString())
      .limit(50);

    if (hourBeforeBookings) {
      for (const booking of hourBeforeBookings) {
        const settings = Array.isArray(booking.scheduler_settings)
          ? booking.scheduler_settings[0]
          : booking.scheduler_settings;

        if (settings?.send_hour_before_reminder !== false) {
          await sendHourBeforeReminder(supabase, booking);
          processed++;
        }
      }
    }

    // 4. Send post-inspection follow-ups (completed appointments without follow-up)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const { data: completedBookings } = await supabase
      .from("schedule_bookings")
      .select(`
        id,
        workspace_id,
        homeowner_name,
        homeowner_email,
        homeowner_phone,
        inspection_completed_at,
        followup_sent_post_inspection,
        scheduler_settings!inner(send_post_inspection_followup)
      `)
      .eq("status", "completed")
      .eq("followup_sent_post_inspection", false)
      .gte("inspection_completed_at", oneDayAgo.toISOString())
      .limit(50);

    if (completedBookings) {
      for (const booking of completedBookings) {
        const settings = Array.isArray(booking.scheduler_settings)
          ? booking.scheduler_settings[0]
          : booking.scheduler_settings;

        if (settings?.send_post_inspection_followup !== false) {
          await sendPostInspectionFollowup(supabase, booking);
          processed++;
        }
      }
    }

    // 5. Send no-show recovery (if enabled)
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const { data: noShowBookings } = await supabase
      .from("schedule_bookings")
      .select(`
        id,
        workspace_id,
        homeowner_name,
        homeowner_email,
        homeowner_phone,
        start_time,
        no_show_recovery_sent,
        scheduler_settings!inner(no_show_recovery_enabled, no_show_recovery_delay_hours)
      `)
      .eq("status", "no_show")
      .eq("no_show_recovery_sent", false)
      .lte("start_time", twoHoursAgo.toISOString())
      .limit(50);

    if (noShowBookings) {
      for (const booking of noShowBookings) {
        const settings = Array.isArray(booking.scheduler_settings)
          ? booking.scheduler_settings[0]
          : booking.scheduler_settings;

        if (settings?.no_show_recovery_enabled !== false) {
          const delayHours = settings?.no_show_recovery_delay_hours || 2;
          const recoveryTime = new Date(
            new Date(booking.start_time).getTime() + delayHours * 60 * 60 * 1000
          );

          if (now >= recoveryTime) {
            await sendNoShowRecovery(supabase, booking);
            processed++;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      timestamp: now.toISOString(),
    });
  } catch (error: any) {
    console.error("Error in scheduler-reminders cron:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

async function sendBookingConfirmation(supabase: any, booking: any) {
  // TODO: Implement actual email/SMS sending
  // For now, just mark as sent
  await supabase
    .from("schedule_bookings")
    .update({ confirmation_sent: true })
    .eq("id", booking.id);

  await supabase.from("appointment_reminders").insert({
    booking_id: booking.id,
    workspace_id: booking.workspace_id,
    reminder_type: "booking_confirmation",
    sent_via: "email",
    email_sent: true,
    sent_at: new Date().toISOString(),
  });
}

async function sendDayBeforeReminder(supabase: any, booking: any) {
  // TODO: Implement actual email/SMS sending with weather tip
  await supabase
    .from("schedule_bookings")
    .update({ reminder_sent_day_before: true })
    .eq("id", booking.id);

  await supabase.from("appointment_reminders").insert({
    booking_id: booking.id,
    workspace_id: booking.workspace_id,
    reminder_type: "day_before",
    sent_via: "email",
    email_sent: true,
    sent_at: new Date().toISOString(),
  });
}

async function sendHourBeforeReminder(supabase: any, booking: any) {
  // TODO: Implement actual email/SMS sending with travel note
  await supabase
    .from("schedule_bookings")
    .update({ reminder_sent_hour_before: true })
    .eq("id", booking.id);

  await supabase.from("appointment_reminders").insert({
    booking_id: booking.id,
    workspace_id: booking.workspace_id,
    reminder_type: "hour_before",
    sent_via: "email",
    email_sent: true,
    sent_at: new Date().toISOString(),
  });
}

async function sendPostInspectionFollowup(supabase: any, booking: any) {
  // TODO: Implement actual email/SMS sending
  await supabase
    .from("schedule_bookings")
    .update({ followup_sent_post_inspection: true })
    .eq("id", booking.id);

  await supabase.from("appointment_reminders").insert({
    booking_id: booking.id,
    workspace_id: booking.workspace_id,
    reminder_type: "post_inspection",
    sent_via: "email",
    email_sent: true,
    sent_at: new Date().toISOString(),
  });
}

async function sendNoShowRecovery(supabase: any, booking: any) {
  // TODO: Implement actual email/SMS sending with new booking link
  await supabase
    .from("schedule_bookings")
    .update({ no_show_recovery_sent: true })
    .eq("id", booking.id);

  await supabase.from("appointment_reminders").insert({
    booking_id: booking.id,
    workspace_id: booking.workspace_id,
    reminder_type: "no_show_recovery",
    sent_via: "email",
    email_sent: true,
    sent_at: new Date().toISOString(),
  });
}





















































