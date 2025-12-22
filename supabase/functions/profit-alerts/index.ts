// Block 252600 — Profit Alerts Edge Function
// Monitors job profitability and sends alerts for low margins

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY");
const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

interface ProfitAlert {
  job_id: string;
  company_id: string;
  customer_name: string;
  contract_price: number;
  total_costs: number;
  profit: number;
  profit_margin: number;
  alert_level: "warning" | "critical";
}

async function sendSMS(phone: string, message: string): Promise<boolean> {
  if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
    console.log("Twilio not configured, skipping SMS");
    return false;
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
        },
        body: new URLSearchParams({
          From: twilioPhoneNumber,
          To: phone,
          Body: message,
        }),
      }
    );

    return response.ok;
  } catch (error) {
    console.error("SMS send error:", error);
    return false;
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!resendApiKey) {
    console.log("Resend not configured, skipping email");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SmartSend Profit Alerts <alerts@smartsend.ai>",
        to,
        subject,
        html,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error("Email send error:", error);
    return false;
  }
}

async function checkProfitAlerts(companyId?: string): Promise<ProfitAlert[]> {
  // Query jobs with low margins
  let query = supabase
    .from("job_profitability")
    .select("*")
    .or("profit_margin.lt.30,profit_margin.lt.15");

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  const { data: jobs, error } = await query;

  if (error) {
    console.error("Error fetching jobs:", error);
    return [];
  }

  const alerts: ProfitAlert[] = [];

  for (const job of jobs || []) {
    const margin = job.profit_margin || 0;
    let alertLevel: "warning" | "critical" = "warning";

    if (margin < 15) {
      alertLevel = "critical";
    } else if (margin < 30) {
      alertLevel = "warning";
    } else {
      continue; // Skip jobs with healthy margins
    }

    alerts.push({
      job_id: job.job_id,
      company_id: job.company_id,
      customer_name: job.customer_name || "Unknown",
      contract_price: job.contract_price || 0,
      total_costs: job.total_costs || 0,
      profit: job.profit || 0,
      profit_margin: margin,
      alert_level: alertLevel,
    });
  }

  return alerts;
}

async function sendAlertToOwner(alert: ProfitAlert): Promise<void> {
  // Get company owner
  const { data: company } = await supabase
    .from("roofing_companies")
    .select("owner_id, name")
    .eq("id", alert.company_id)
    .single();

  if (!company) {
    console.error("Company not found:", alert.company_id);
    return;
  }

  // Get owner contact info
  const { data: owner } = await supabase.auth.admin.getUserById(company.owner_id);
  if (!owner?.user) {
    console.error("Owner not found:", company.owner_id);
    return;
  }

  const ownerEmail = owner.user.email;
  const ownerPhone = owner.user.phone;

  // Build alert message
  const emoji = alert.alert_level === "critical" ? "🚨" : "⚠️";
  const title = alert.alert_level === "critical" ? "PROFIT ALERT" : "PROFIT WARNING";
  const marginText = alert.profit_margin.toFixed(1);

  const smsMessage = `${emoji} ${title}\n\nJob: ${alert.customer_name}\nMargin: ${marginText}%\n${alert.alert_level === "critical" ? "Below 15% - Review immediately" : "Below 30% target"}\n\nContract: $${alert.contract_price.toLocaleString()}\nCosts: $${alert.total_costs.toLocaleString()}\nProfit: $${alert.profit.toLocaleString()}`;

  const emailHtml = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: ${alert.alert_level === "critical" ? "#d32f2f" : "#f57c00"};">
            ${emoji} ${title}
          </h2>
          <p><strong>Job:</strong> ${alert.customer_name}</p>
          <p><strong>Profit Margin:</strong> ${marginText}%</p>
          <p><strong>Status:</strong> ${alert.alert_level === "critical" ? "🔴 Below 15% - Review immediately" : "🟡 Below company target of 30%"}</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0;"><strong>Contract Price:</strong></td>
              <td style="text-align: right; padding: 8px 0;">$${alert.contract_price.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Total Costs:</strong></td>
              <td style="text-align: right; padding: 8px 0;">$${alert.total_costs.toLocaleString()}</td>
            </tr>
            <tr style="border-top: 2px solid #333;">
              <td style="padding: 8px 0;"><strong>Profit:</strong></td>
              <td style="text-align: right; padding: 8px 0; font-weight: bold; color: ${alert.profit < 0 ? "#d32f2f" : "#2e7d32"};">$${alert.profit.toLocaleString()}</td>
            </tr>
          </table>
          <p style="margin-top: 20px; color: #666; font-size: 14px;">
            Review materials, labor, and subs immediately to identify cost overruns.
          </p>
        </div>
      </body>
    </html>
  `;

  // Send SMS
  if (ownerPhone) {
    await sendSMS(ownerPhone, smsMessage);
  }

  // Send Email
  if (ownerEmail) {
    await sendEmail(ownerEmail, `${title} - Job Margin at ${marginText}%`, emailHtml);
  }
}

Deno.serve(async (req) => {
  try {
    // Handle CORS
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const payload = await req.json().catch(() => ({}));
    const { company_id, job_id } = payload;

    // If job_id provided, check single job
    if (job_id) {
      const { data: job } = await supabase
        .from("job_profitability")
        .select("*")
        .eq("job_id", job_id)
        .single();

      if (job && (job.profit_margin < 30)) {
        const alert: ProfitAlert = {
          job_id: job.job_id,
          company_id: job.company_id,
          customer_name: job.customer_name || "Unknown",
          contract_price: job.contract_price || 0,
          total_costs: job.total_costs || 0,
          profit: job.profit || 0,
          profit_margin: job.profit_margin || 0,
          alert_level: job.profit_margin < 15 ? "critical" : "warning",
        };
        await sendAlertToOwner(alert);
      }

      return new Response(
        JSON.stringify({ ok: true, checked: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Otherwise, check all jobs (or company-specific)
    const alerts = await checkProfitAlerts(company_id);

    // Send alerts (deduplicate by job_id to avoid spam)
    const sentAlerts = new Set<string>();
    for (const alert of alerts) {
      if (!sentAlerts.has(alert.job_id)) {
        await sendAlertToOwner(alert);
        sentAlerts.add(alert.job_id);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        alerts_found: alerts.length,
        alerts_sent: sentAlerts.size,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Profit alerts error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
























