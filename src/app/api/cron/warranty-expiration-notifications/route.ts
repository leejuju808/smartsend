// GET /api/cron/warranty-expiration-notifications
// Cron job to notify homeowners 30 days before warranty expires
// Should be run daily

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret if needed
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find warranties expiring in 30 days
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const dateStr = thirtyDaysFromNow.toISOString().split("T")[0];

    const { data: expiringWarranties, error } = await supabase
      .from("warranties")
      .select(`
        *,
        homeowner:homeowners(*),
        job:roofing_jobs(*)
      `)
      .eq("is_active", true)
      .eq("end_date", dateStr)
      .eq("expires_soon", true);

    if (error) {
      console.error("Error fetching expiring warranties:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    const notifications = [];

    for (const warranty of expiringWarranties || []) {
      // TODO: Send email/SMS notification to homeowner
      // This would integrate with your notification system
      
      notifications.push({
        warranty_id: warranty.id,
        homeowner_id: warranty.homeowner_id,
        end_date: warranty.end_date,
        notification_sent: true,
      });

      // TODO: Create upsell opportunity for inspection/maintenance
      // This could create a lead or service ticket automatically
    }

    return NextResponse.json({
      message: `Processed ${notifications.length} expiring warranties`,
      notifications,
    });
  } catch (error: any) {
    console.error("Error in warranty-expiration-notifications:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























