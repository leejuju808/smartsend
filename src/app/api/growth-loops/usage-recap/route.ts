import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * POST /api/growth-loops/usage-recap
 * Send weekly usage recap email with upgrade CTA
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all active workspaces with usage in last 7 days
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id, name, owner_id")
      .limit(100); // Process in batches

    if (!workspaces) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: "No workspaces to process",
      });
    }

    let sent = 0;
    let skipped = 0;

    for (const workspace of workspaces) {
      try {
        // Get workspace owner
        const { data: owner } = await supabase
          .from("profiles")
          .select("email, full_name, subscription_status")
          .eq("user_id", workspace.owner_id)
          .single();

        if (!owner || !owner.email) {
          skipped++;
          continue;
        }

        // Skip if already on paid plan
        if (owner.subscription_status === "active" || owner.subscription_status === "trialing") {
          skipped++;
          continue;
        }

        // Get usage metrics for last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { data: metrics } = await supabase
          .from("ai_insights_metrics")
          .select("emails_sent, emails_replied")
          .eq("workspace_id", workspace.id)
          .gte("metric_date", sevenDaysAgo.toISOString().split("T")[0])
          .order("metric_date", { ascending: false });

        const totalSent = metrics?.reduce((sum, m) => sum + (m.emails_sent || 0), 0) || 0;
        const totalReplied = metrics?.reduce((sum, m) => sum + (m.emails_replied || 0), 0) || 0;

        // Only send if they sent emails
        if (totalSent === 0) {
          skipped++;
          continue;
        }

        // Send recap email
        if (resend) {
          await resend.emails.send({
            from: "Julian <julian@smartsendhq.com>",
            to: [owner.email],
            subject: `📊 Your SmartSend Week: ${totalSent} emails sent, ${totalReplied} replies`,
            html: `
              <p>Hey ${owner.full_name || "there"},</p>
              <p>Here's your weekly SmartSend recap:</p>
              <ul>
                <li><strong>${totalSent} emails sent</strong> this week</li>
                <li><strong>${totalReplied} replies received</strong></li>
                <li><strong>${((totalReplied / totalSent) * 100).toFixed(1)}% reply rate</strong></li>
              </ul>
              <p>Want to scale faster? Upgrade to Pro for:</p>
              <ul>
                <li>Higher sending limits</li>
                <li>Advanced AI personalization</li>
                <li>Priority support</li>
              </ul>
              <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing" style="background: #000; color: #ffd700; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px;">Upgrade to Pro →</a></p>
              <p>Keep crushing it,<br>⚡ Julian</p>
            `,
          });
        }

        // Log event
        await supabase.from("growth_loop_events").insert({
          workspace_id: workspace.id,
          event_type: "usage_recap",
          metadata: {
            emails_sent: totalSent,
            emails_replied: totalReplied,
          },
          sent_at: new Date().toISOString(),
        });

        sent++;
      } catch (error) {
        console.error(`Error sending recap to workspace ${workspace.id}:`, error);
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      skipped,
      total: workspaces.length,
    });
  } catch (error: any) {
    console.error("Usage recap error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

