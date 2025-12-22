/**
 * Block 24780 — SmartSend Roofing Owner Inbox Daily Digest
 * Sends daily digest email to owners at 6AM
 */

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
    // Get all workspaces with owners
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id, owner_id");

    if (workspacesError || !workspaces) {
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to fetch workspaces" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    let processed = 0;

    for (const workspace of workspaces) {
      if (!workspace.owner_id) continue;

      // Get owner email
      const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(
        workspace.owner_id
      );

      if (userError || !user?.email) {
        console.warn(`Could not get email for owner ${workspace.owner_id}`);
        continue;
      }

      // Get digest data
      const { data: digest, error: digestError } = await supabase.rpc(
        "get_owner_inbox_digest",
        {
          p_workspace_id: workspace.id,
          p_owner_id: workspace.owner_id,
        }
      );

      if (digestError || !digest) {
        console.warn(`Could not get digest for workspace ${workspace.id}`);
        continue;
      }

      const criticalIssues = digest.critical_issues || [];
      const highPriority = digest.high_priority || [];
      const opportunities = digest.opportunities || [];
      const financialOverview = digest.financial_overview || {};

      // Skip if no items
      if (
        criticalIssues.length === 0 &&
        highPriority.length === 0 &&
        opportunities.length === 0
      ) {
        continue;
      }

      // Build email HTML
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000; color: #fff; padding: 30px; border-radius: 8px 8px 0 0; }
            .content { background: #fff; padding: 30px; border: 1px solid #e5e5e5; }
            .section { margin-bottom: 30px; }
            .section-title { font-size: 20px; font-weight: 600; margin-bottom: 15px; color: #000; }
            .item { padding: 15px; background: #f9f9f9; border-left: 4px solid #000; margin-bottom: 10px; border-radius: 4px; }
            .item-title { font-weight: 600; margin-bottom: 5px; }
            .item-description { color: #666; font-size: 14px; }
            .priority-critical { border-left-color: #ef4444; }
            .priority-high { border-left-color: #f97316; }
            .priority-medium { border-left-color: #eab308; }
            .priority-low { border-left-color: #22c55e; }
            .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
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
              <h1>🔥 SmartSend Owner Digest — Today's Snapshot</h1>
              <p style="margin: 0; opacity: 0.9;">
                ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
            
            <div class="content">
              ${criticalIssues.length > 0 ? `
                <div class="section">
                  <div class="section-title" style="color: #ef4444;">🔴 Critical Issues (${criticalIssues.length})</div>
                  ${criticalIssues.map((item: any) => `
                    <div class="item priority-critical">
                      <div class="item-title">${item.title}</div>
                      ${item.description ? `<div class="item-description">${item.description}</div>` : ''}
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              
              ${highPriority.length > 0 ? `
                <div class="section">
                  <div class="section-title" style="color: #f97316;">🟠 High-Priority (${highPriority.length})</div>
                  ${highPriority.map((item: any) => `
                    <div class="item priority-high">
                      <div class="item-title">${item.title}</div>
                      ${item.description ? `<div class="item-description">${item.description}</div>` : ''}
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              
              ${opportunities.length > 0 ? `
                <div class="section">
                  <div class="section-title" style="color: #22c55e;">💡 Opportunities (${opportunities.length})</div>
                  ${opportunities.map((item: any) => `
                    <div class="item priority-low">
                      <div class="item-title">${item.title}</div>
                      ${item.description ? `<div class="item-description">${item.description}</div>` : ''}
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              
              <div class="section">
                <div class="section-title">💰 Financial Overview</div>
                <div class="stats">
                  <div class="stat">
                    <div class="stat-number">$${((financialOverview.collected_this_week || 0) / 1000).toFixed(1)}k</div>
                    <div class="stat-label">Collected This Week</div>
                  </div>
                  <div class="stat">
                    <div class="stat-number">$${((financialOverview.outstanding || 0) / 1000).toFixed(1)}k</div>
                    <div class="stat-label">Outstanding</div>
                  </div>
                  <div class="stat">
                    <div class="stat-number">${financialOverview.jobs_scheduled_today || 0}</div>
                    <div class="stat-label">Jobs Scheduled Today</div>
                  </div>
                </div>
              </div>
              
              <div style="text-align: center; margin-top: 30px;">
                <a href="${APP_URL}/owner-inbox" class="button">View Owner Inbox →</a>
              </div>
            </div>
            
            <div class="footer">
              <p>This is your daily SmartSend Owner Digest. You're receiving this because you're the owner of this workspace.</p>
              <p style="margin-top: 10px;">
                <a href="${APP_URL}/settings/notifications" style="color: #666;">Manage notifications</a>
              </p>
            </div>
          </div>
        </body>
        </html>
      `;

      // Send email via Resend
      if (RESEND_KEY) {
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_KEY}`,
          },
          body: JSON.stringify({
            from: EMAIL_FROM,
            to: user.email,
            subject: `🔥 SmartSend Owner Digest — ${criticalIssues.length} Critical Issues Need Your Attention`,
            html: emailHtml,
          }),
        });

        if (!resendResponse.ok) {
          console.error(`Failed to send email to ${user.email}`);
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
    console.error("Owner inbox daily digest error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});






































