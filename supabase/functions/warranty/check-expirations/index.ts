// Block 52000 — SmartSend Roofing Warranty Tracking + Service Call System v1
// Edge Function: /warranty/check-expirations
// Daily cron job to check warranty expirations and send alerts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  try {
    // Update expired warranties
    const { data: expiredCount, error: updateError } = await supabase.rpc(
      "check_warranty_expirations"
    );

    if (updateError) {
      console.error("Error checking warranty expirations:", updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get warranties expiring soon (30, 60, 90 days)
    const today = new Date();
    const thirtyDays = new Date(today);
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const sixtyDays = new Date(today);
    sixtyDays.setDate(sixtyDays.getDate() + 60);
    const ninetyDays = new Date(today);
    ninetyDays.setDate(ninetyDays.getDate() + 90);

    const { data: expiringSoon, error: expiringError } = await supabase
      .from("warranties")
      .select(
        `
        id,
        job_id,
        homeowner_id,
        expiration_date,
        workspace_id,
        roofing_jobs!inner(title),
        homeowners(email, name)
      `
      )
      .eq("status", "active")
      .gte("expiration_date", today.toISOString().split("T")[0])
      .lte("expiration_date", ninetyDays.toISOString().split("T")[0])
      .order("expiration_date", { ascending: true });

    if (expiringError) {
      console.error("Error fetching expiring warranties:", expiringError);
    }

    // Calculate days remaining for each
    const warrantiesWithDays = (expiringSoon || []).map((w) => {
      const expirationDate = new Date(w.expiration_date);
      const daysRemaining = Math.ceil(
        (expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        ...w,
        days_remaining: daysRemaining,
        alert_level:
          daysRemaining <= 30
            ? "urgent"
            : daysRemaining <= 60
            ? "warning"
            : "info",
      };
    });

    // TODO: Send email alerts to homeowners and owners
    // TODO: Create dashboard alerts
    // TODO: Update homeowner portal with expiration notices

    return new Response(
      JSON.stringify({
        success: true,
        expired_count: expiredCount || 0,
        expiring_soon: warrantiesWithDays,
        checked_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in warranty/check-expirations:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

