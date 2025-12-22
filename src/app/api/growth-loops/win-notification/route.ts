import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * POST /api/growth-loops/win-notification
 * Send automated win notification email when user achieves milestone
 */
export async function POST(req: NextRequest) {
  try {
    const { workspace_id, milestone_type, metadata } = await req.json();

    if (!workspace_id || !milestone_type) {
      return NextResponse.json(
        { error: "workspace_id and milestone_type required" },
        { status: 400 }
      );
    }

    // Get workspace and owner
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id, name, owner_id")
      .eq("id", workspace_id)
      .single();

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const { data: owner } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", workspace.owner_id)
      .single();

    if (!owner || !owner.email) {
      return NextResponse.json(
        { error: "Workspace owner not found" },
        { status: 404 }
      );
    }

    // Determine email content based on milestone
    const milestoneConfig: Record<
      string,
      { subject: string; body: string }
    > = {
      first_reply: {
        subject: "🎉 You got your first reply on SmartSend!",
        body: `
          <p>Hey ${owner.full_name || "there"},</p>
          <p>Congratulations! You just received your first reply using SmartSend.</p>
          <p>This is just the beginning. Here's what you can do next:</p>
          <ul>
            <li>Scale your campaigns to reach more prospects</li>
            <li>Use AI to personalize at scale</li>
            <li>Track your ROI in the dashboard</li>
          </ul>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard">View Dashboard →</a></p>
        `,
      },
      ten_replies: {
        subject: "🚀 10 replies! You're on fire",
        body: `
          <p>Hey ${owner.full_name || "there"},</p>
          <p>Amazing work! You've hit 10 replies. Your campaigns are working.</p>
          <p>Want to scale faster? Upgrade to Pro for higher sending limits and AI features.</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing">Upgrade Now →</a></p>
        `,
      },
      first_conversion: {
        subject: "💰 First conversion from SmartSend!",
        body: `
          <p>Hey ${owner.full_name || "there"},</p>
          <p>Incredible! You just closed your first deal from a SmartSend campaign.</p>
          <p>Let's optimize your sequences to close even more. Check out your analytics.</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/analytics">View Analytics →</a></p>
        `,
      },
    };

    const config = milestoneConfig[milestone_type] || {
      subject: "🎉 Milestone achieved!",
      body: `<p>Congratulations on reaching this milestone!</p>`,
    };

    // Send email
    if (resend) {
      await resend.emails.send({
        from: "Julian <julian@smartsendhq.com>",
        to: [owner.email],
        subject: config.subject,
        html: config.body,
      });
    }

    // Log the notification
    await supabase.from("growth_loop_events").insert({
      workspace_id,
      event_type: "win_notification",
      milestone_type,
      metadata: metadata || {},
      sent_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      sent: true,
    });
  } catch (error: any) {
    console.error("Win notification error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

