// Block 252400 — SmartSend Equipment & Asset Tracking System v1
// Edge Function: /maintenance-reminder
// Sends maintenance reminders for equipment due within 7 days

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get all companies
    const { data: companies, error: companiesError } = await supabase
      .from("roofing_companies")
      .select("id, name")
      .eq("is_active", true);

    if (companiesError) {
      console.error("Error fetching companies:", companiesError);
      return new Response(
        JSON.stringify({ error: companiesError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const reminders = [];

    // For each company, get assets due for maintenance
    for (const company of companies || []) {
      const { data: assetsDue, error: assetsError } = await supabase.rpc(
        "get_assets_due_for_maintenance",
        {
          p_company_id: company.id,
          p_days_ahead: 7,
        }
      );

      if (assetsError) {
        console.error(
          `Error fetching maintenance due for company ${company.id}:`,
          assetsError
        );
        continue;
      }

      if (assetsDue && assetsDue.length > 0) {
        // Get company members with PM/admin roles
        const { data: members, error: membersError } = await supabase
          .from("roofing_company_members")
          .select("user_id, role")
          .eq("roofing_company_id", company.id)
          .eq("is_active", true)
          .in("role", ["owner", "admin", "ops"]);

        if (membersError) {
          console.error(
            `Error fetching members for company ${company.id}:`,
            membersError
          );
          continue;
        }

        // Create reminder for each member
        for (const member of members || []) {
          // Get user email
          const { data: user } = await supabase.auth.admin.getUserById(
            member.user_id
          );

          if (user?.user?.email) {
            reminders.push({
              company_id: company.id,
              company_name: company.name,
              user_id: member.user_id,
              user_email: user.user.email,
              assets_due: assetsDue,
              count: assetsDue.length,
            });

            // TODO: Send email notification
            // This would integrate with your email service (SendGrid, Resend, etc.)
            console.log(
              `Maintenance reminder for ${user.user.email}: ${assetsDue.length} assets due`
            );
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        reminders_sent: reminders.length,
        reminders: reminders.map((r) => ({
          company: r.company_name,
          user_email: r.user_email,
          assets_count: r.count,
        })),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in maintenance-reminder:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
























