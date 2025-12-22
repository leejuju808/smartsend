// Block 256100 — Warranty Expiration Alerts Cron Job
// GET /api/warranty/expiration-alerts
// Sends alerts at 90 days, 30 days, and 7 days before warranty expiration
// Should be run daily

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret if needed
    const authHeader = req.headers.get("authorization");
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret && cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const alertsSent = {
      "90_days": 0,
      "30_days": 0,
      "7_days": 0,
    };
    const errors: string[] = [];

    // Get all teams
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id");

    if (teamsError || !teams) {
      return NextResponse.json(
        { error: "Failed to fetch teams" },
        { status: 500 }
      );
    }

    for (const team of teams) {
      // Get warranties expiring soon using the function
      const { data: expiringWarranties, error: warrantiesError } = await supabase
        .rpc("get_warranties_expiring_soon", {
          p_team_id: team.id,
          p_days_ahead: 90,
        });

      if (warrantiesError) {
        errors.push(`Team ${team.id}: ${warrantiesError.message}`);
        continue;
      }

      if (!expiringWarranties || expiringWarranties.length === 0) {
        continue;
      }

      for (const warranty of expiringWarranties) {
        // Only process specific alert types
        if (!["90_days", "30_days", "7_days"].includes(warranty.alert_type)) {
          continue;
        }

        const alertType = warranty.alert_type as keyof typeof alertsSent;
        
        // Get email template based on alert type
        const templateKey = `warranty_expiration_${warranty.alert_type}`;
        
        // Generate message
        const daysUntilExpiration = warranty.days_until_expiration;
        const subject = `Your ${warranty.warranty_type} warranty expires in ${daysUntilExpiration} days`;
        const message = `Hi ${warranty.customer_name || "there"},

Your ${warranty.warranty_type} warranty is expiring in ${daysUntilExpiration} days (${warranty.end_date}).

We recommend scheduling a free inspection to ensure everything is in great shape. This is also a perfect time to discuss any maintenance needs or potential upgrades.

Would you like to schedule an inspection? Just reply to this message or give us a call.

Thank you for being a valued customer!`;

        // Send email/SMS notification
        // TODO: Integrate with actual email/SMS sending service
        // For now, we'll create a notification record
        
        try {
          // Create notification record (you can integrate with your email/SMS service here)
          await supabase.from("customer_events").insert({
            customer_id: warranty.customer_id,
            team_id: team.id,
            event_type: "warranty_expiring",
            title: `Warranty Expiring in ${daysUntilExpiration} Days`,
            description: message,
            priority: warranty.alert_type === "7_days" ? "high" : "medium",
            event_date: warranty.end_date,
            status: "pending",
            related_warranty_id: warranty.warranty_id,
          });

          alertsSent[alertType]++;
        } catch (error: any) {
          errors.push(`Warranty ${warranty.warranty_id}: ${error.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      alerts_sent: alertsSent,
      total_alerts: alertsSent["90_days"] + alertsSent["30_days"] + alertsSent["7_days"],
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error in warranty-expiration-alerts:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















