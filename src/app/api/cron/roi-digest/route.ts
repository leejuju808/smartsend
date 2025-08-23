import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { sendEmail } from "@/lib/notify/mailer";

// Verify this is a legitimate cron job
function verifyCron(token: string | null): boolean {
  const key = token || "";
  return Boolean(key && key === process.env.CRON_SECRET);
}

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "") || null;
  
  if (!verifyCron(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all teams with active users
    const { data: teams } = await supabaseAdmin
      .from("teams")
      .select("id, name, owner_id")
      .not("id", "is", null);

    if (!teams) return NextResponse.json({ message: "No teams found" });

    let emailsSent = 0;
    let errors = 0;

    for (const team of teams) {
      try {
        // Get team owner profile
        const { data: owner } = await supabaseAdmin
          .from("profiles")
          .select("email, first_name")
          .eq("id", team.owner_id)
          .maybeSingle();

        if (!owner?.email) continue;

        // Get weekly analytics for this team
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        
        const { count: replies } = await supabaseAdmin
          .from("ai_reply_events")
          .select("id", { count: "exact", head: true })
          .eq("team_id", team.id)
          .gte("created_at", weekAgo);

        const { count: meetings } = await supabaseAdmin
          .from("ai_reply_events")
          .select("id", { count: "exact", head: true })
          .eq("team_id", team.id)
          .eq("meeting_booked", true)
          .gte("created_at", weekAgo);

        // Calculate hours saved (5 minutes per reply)
        const hoursSaved = ((replies || 0) * 5) / 60;
        const hours = Math.floor(hoursSaved);
        const minutes = Math.round((hoursSaved - hours) * 60);

        // Format time string
        let timeString = "";
        if (hours > 0) {
          timeString = `${hours}h ${minutes}m`;
        } else {
          timeString = `${minutes}m`;
        }

        // Send email digest
        const subject = `Your SmartSendAI Weekly Digest - ${team.name}`;
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Your SmartSendAI Weekly Digest</h2>
            <p>Hi ${owner.first_name || "there"},</p>
            <p>Here's what SmartSendAI accomplished for <strong>${team.name}</strong> this week:</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; text-align: center;">
                <div>
                  <div style="font-size: 24px; font-weight: bold; color: #007bff;">${replies || 0}</div>
                  <div style="font-size: 14px; color: #666;">AI replies sent</div>
                </div>
                <div>
                  <div style="font-size: 24px; font-weight: bold; color: #28a745;">${meetings || 0}</div>
                  <div style="font-size: 14px; color: #666;">Meetings booked</div>
                </div>
                <div>
                  <div style="font-size: 24px; font-weight: bold; color: #ffc107;">${timeString}</div>
                  <div style="font-size: 14px; color: #666;">Time saved</div>
                </div>
              </div>
            </div>

            <p style="color: #666; font-size: 14px;">
              That's ${timeString} you didn't spend writing emails! 🎉
            </p>

            <p style="color: #666; font-size: 14px;">
              <strong>Pro tip:</strong> Teams using Pro average 2× more meetings. 
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing" style="color: #007bff;">Upgrade now</a>
            </p>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">
              You're receiving this because you're the owner of ${team.name}. 
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings" style="color: #999;">Manage preferences</a>
            </p>
          </div>
        `;

        await sendEmail({
          to: owner.email,
          subject,
          text: `Your SmartSendAI Weekly Digest - ${team.name}

Hi ${owner.first_name || "there"},

Here's what SmartSendAI accomplished for ${team.name} this week:

AI replies sent: ${replies || 0}
Meetings booked: ${meetings || 0}
Time saved: ${timeString}

That's ${timeString} you didn't spend writing emails! 🎉

Pro tip: Teams using Pro average 2× more meetings. 
Upgrade now: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing

You're receiving this because you're the owner of ${team.name}. 
Manage preferences: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
        });

        emailsSent++;
      } catch (error) {
        console.error(`Error sending ROI digest to team ${team.id}:`, error);
        errors++;
      }
    }

    return NextResponse.json({ 
      message: "ROI digest sent", 
      emailsSent, 
      errors,
      totalTeams: teams.length 
    });

  } catch (error) {
    console.error("ROI digest cron error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 