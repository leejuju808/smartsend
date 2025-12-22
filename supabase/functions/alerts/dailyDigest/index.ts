import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "SmartSend <no-reply@smartsend.ai>";
const APP_URL = Deno.env.get("APP_URL") || "https://app.smartsend.ai";

Deno.serve(async (req) => {
  try {
    // Get all users with daily digest enabled
    const { data: settings } = await supabase
      .from("alert_settings")
      .select("workspace_id, user_id, daily_digest_time")
      .eq("daily_digest_enabled", true);

    if (!settings || settings.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:00`;

    let processed = 0;

    for (const setting of settings) {
      // Check if it's time to send (within 5 minute window)
      const digestTime = setting.daily_digest_time || "08:00:00";
      const [digestHour, digestMin] = digestTime.split(":").map(Number);
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();

      // Skip if not within 5 minute window
      if (currentHour !== digestHour || currentMin < digestMin || currentMin > digestMin + 5) {
        continue;
      }

      // Get yesterday's date range
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);

      // Get alerts from yesterday
      const { data: alerts } = await supabase
        .from("alerts")
        .select(`
          *,
          contact:contacts(email, first_name, last_name),
          campaign:campaigns(name)
        `)
        .eq("workspace_id", setting.workspace_id)
        .or(`user_id.eq.${setting.user_id},user_id.is.null`)
        .gte("created_at", yesterday.toISOString())
        .lte("created_at", yesterdayEnd.toISOString())
        .order("created_at", { ascending: false });

      if (!alerts || alerts.length === 0) {
        continue; // Skip if no alerts
      }

      // Get user email
      const { data: { user } } = await supabase.auth.admin.getUserById(setting.user_id);
      if (!user?.email) {
        continue;
      }

      // Group alerts by type
      const alertsByType = {
        hot_lead: alerts.filter(a => a.type === "hot_lead"),
        insurance_claim: alerts.filter(a => a.type === "insurance_claim"),
        storm_damage: alerts.filter(a => a.type === "storm_damage"),
        appointment: alerts.filter(a => a.type === "appointment"),
        system_billing: alerts.filter(a => a.type === "system_billing"),
        performance_insights: alerts.filter(a => a.type === "performance_insights"),
      };

      // Build email content
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000; color: #fff; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #fff; padding: 30px; border: 1px solid #e5e5e5; }
            .section { margin-bottom: 30px; }
            .alert-item { padding: 12px; background: #f9f9f9; border-left: 4px solid #000; margin-bottom: 8px; border-radius: 4px; }
            .alert-title { font-weight: 600; margin-bottom: 4px; }
            .alert-message { color: #666; font-size: 14px; }
            .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
            .stat { text-align: center; padding: 15px; background: #f5f5f5; border-radius: 8px; }
            .stat-number { font-size: 32px; font-weight: bold; color: #000; }
            .stat-label { font-size: 12px; color: #666; text-transform: uppercase; margin-top: 5px; }
            .button { display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔥 Your Daily SmartSend Report</h1>
              <p style="margin: 0; opacity: 0.9;">${yesterday.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <div class="content">
              <div class="stats">
                <div class="stat">
                  <div class="stat-number">${alertsByType.hot_lead.length}</div>
                  <div class="stat-label">Hot Leads</div>
                </div>
                <div class="stat">
                  <div class="stat-number">${alertsByType.insurance_claim.length}</div>
                  <div class="stat-label">Insurance Claims</div>
                </div>
                <div class="stat">
                  <div class="stat-number">${alertsByType.storm_damage.length}</div>
                  <div class="stat-label">Storm Issues</div>
                </div>
                <div class="stat">
                  <div class="stat-number">${alertsByType.appointment.length}</div>
                  <div class="stat-label">Appointments</div>
                </div>
              </div>

              ${alertsByType.hot_lead.length > 0 ? `
                <div class="section">
                  <h2>🔥 Hot Leads (${alertsByType.hot_lead.length})</h2>
                  ${alertsByType.hot_lead.slice(0, 5).map(alert => `
                    <div class="alert-item">
                      <div class="alert-title">${alert.title}</div>
                      <div class="alert-message">${alert.message}</div>
                    </div>
                  `).join('')}
                  ${alertsByType.hot_lead.length > 5 ? `<p style="color: #666; font-size: 14px;">+ ${alertsByType.hot_lead.length - 5} more hot leads</p>` : ''}
                </div>
              ` : ''}

              ${alertsByType.insurance_claim.length > 0 ? `
                <div class="section">
                  <h2>📄 Insurance Claims (${alertsByType.insurance_claim.length})</h2>
                  ${alertsByType.insurance_claim.slice(0, 3).map(alert => `
                    <div class="alert-item">
                      <div class="alert-title">${alert.title}</div>
                      <div class="alert-message">${alert.message}</div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}

              ${alertsByType.storm_damage.length > 0 ? `
                <div class="section">
                  <h2>🌪️ Storm Damage (${alertsByType.storm_damage.length})</h2>
                  ${alertsByType.storm_damage.slice(0, 3).map(alert => `
                    <div class="alert-item">
                      <div class="alert-title">${alert.title}</div>
                      <div class="alert-message">${alert.message}</div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}

              ${alertsByType.appointment.length > 0 ? `
                <div class="section">
                  <h2>📅 Appointments (${alertsByType.appointment.length})</h2>
                  ${alertsByType.appointment.slice(0, 5).map(alert => `
                    <div class="alert-item">
                      <div class="alert-title">${alert.title}</div>
                      <div class="alert-message">${alert.message}</div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}

              <div style="text-align: center; margin-top: 30px;">
                <a href="${APP_URL}/alerts" class="button">View All Alerts</a>
              </div>
            </div>
            <div class="footer">
              <p>SmartSend Real-Time Alerts</p>
              <p>You're receiving this because daily digest is enabled in your alert settings.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const emailText = `
Your Daily SmartSend Report — ${yesterday.toLocaleDateString()}

📊 Summary:
• ${alertsByType.hot_lead.length} Hot Leads
• ${alertsByType.insurance_claim.length} Insurance Claims
• ${alertsByType.storm_damage.length} Storm Issues
• ${alertsByType.appointment.length} Appointments

View all alerts: ${APP_URL}/alerts

SmartSend Real-Time Alerts
      `;

      // Send email via Resend
      if (RESEND_KEY) {
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: EMAIL_FROM,
            to: user.email,
            subject: `🔥 Your Daily SmartSend Report — ${alerts.length} alerts`,
            html: emailHtml,
            text: emailText,
          }),
        });

        if (!resendResponse.ok) {
          console.error(`Failed to send digest to ${user.email}`);
          continue;
        }
      }

      processed++;
    }

    return new Response(
      JSON.stringify({ ok: true, processed }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in alerts/dailyDigest:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});





















































