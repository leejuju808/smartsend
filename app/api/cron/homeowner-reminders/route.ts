// Block 25140 — SmartSend Roofing Homeowner Experience v1
// Cron job: Send day-before reminders for inspections
// Should be called hourly to check for upcoming inspections

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendHomeownerConfirmation } from "@/lib/homeowner-experience/automation";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

    // Find inspections scheduled for tomorrow that haven't received day-before reminder
    const { data: upcomingInspections, error: fetchError } = await supabase
      .from("schedule_bookings")
      .select(`
        id,
        workspace_id,
        contact_id,
        lead_id,
        start_time,
        property_address,
        assigned_to_user_id,
        homeowner_name
      `)
      .eq("status", "booked")
      .eq("appointment_type", "inspection")
      .gte("start_time", tomorrow.toISOString())
      .lte("start_time", tomorrowEnd.toISOString())
      .not("contact_id", "is", null);

    if (fetchError) {
      console.error("Error fetching upcoming inspections:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch inspections" },
        { status: 500 }
      );
    }

    if (!upcomingInspections || upcomingInspections.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: "No inspections scheduled for tomorrow",
      });
    }

    let processed = 0;
    let errors: string[] = [];

    // Check which ones already have day-before reminders
    for (const inspection of upcomingInspections) {
      try {
        // Check if reminder already sent
        const { data: existingReminder } = await supabase
          .from("homeowner_confirmations")
          .select("id")
          .eq("contact_id", inspection.contact_id)
          .eq("confirmation_type", "day_before_reminder")
          .eq("status", "sent")
          .gte("created_at", now.toISOString())
          .maybeSingle();

        if (existingReminder) {
          continue; // Already sent
        }

        // Get inspector name if assigned
        let inspectorName = "our inspector";
        if (inspection.assigned_to_user_id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("name")
            .eq("id", inspection.assigned_to_user_id)
            .maybeSingle();
          
          if (profile?.name) {
            inspectorName = profile.name;
          }
        }

        // Send day-before reminder
        const result = await sendHomeownerConfirmation({
          workspaceId: inspection.workspace_id,
          leadId: inspection.lead_id || undefined,
          contactId: inspection.contact_id,
          confirmationType: "day_before_reminder",
          metadata: {
            inspector_name: inspectorName,
            inspection_time: inspection.start_time,
            inspection_date: new Date(inspection.start_time).toLocaleDateString(),
            property_address: inspection.property_address,
          },
          channel: "email", // Can be enhanced to support SMS
        });

        if (result.success) {
          processed++;
        } else {
          errors.push(`Inspection ${inspection.id}: ${result.error}`);
        }
      } catch (error: any) {
        errors.push(`Inspection ${inspection.id}: ${error.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      total: upcomingInspections.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error in homeowner-reminders cron:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































