// app/api/jobs/daily-digest/route.ts
// Block 8640 — Daily Digest Job
// Sends daily summary email to owners with notify_daily_digest enabled

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  // Load all owners with notify_daily_digest = true
  const { data: notifRows, error } = await supabase
    .from("notification_settings")
    .select("owner_id, notify_daily_digest")
    .eq("notify_daily_digest", true);

  if (error || !notifRows?.length) {
    return NextResponse.json(
      { processed: 0 },
      { status: 200 }
    );
  }

  const ownerIds = notifRows.map((n) => n.owner_id);
  
  // Get user emails from profiles
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", ownerIds);

  const profileMap = new Map(
    (profileRows ?? []).map((p: any) => [p.id, p])
  );

  // Fallback: get emails from auth.users for any missing
  const ownerEmails = new Map<string, string>();
  for (const ownerId of ownerIds) {
    const profile = profileMap.get(ownerId);
    if (profile?.email) {
      ownerEmails.set(ownerId, profile.email);
    } else {
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(ownerId);
        if (authUser?.user?.email) {
          ownerEmails.set(ownerId, authUser.user.email);
        }
      } catch (e) {
        console.warn(`Could not get email for owner_id ${ownerId}:`, e);
      }
    }
  }

  const today = new Date();
  const dayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const dayStartIso = dayStart.toISOString();

  let sentCount = 0;

  for (const ownerId of ownerIds) {
    const ownerEmail = ownerEmails.get(ownerId);
    if (!ownerEmail) {
      console.warn(`No email found for owner_id: ${ownerId}`);
      continue;
    }

    // Basic stats for today
    const { data: sentRows } = await supabase
      .from("outbound_emails")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("status", "sent")
      .gte("sent_at", dayStartIso);

    const { data: inboundRows } = await supabase
      .from("inbound_emails")
      .select("id, classification")
      .eq("owner_id", ownerId)
      .gte("received_at", dayStartIso);

    const { data: wonRows } = await supabase
      .from("leads")
      .select("id, won_value")
      .eq("owner_id", ownerId)
      .eq("outcome", "won")
      .gte("won_at", dayStartIso);

    const { data: newLeads } = await supabase
      .from("leads")
      .select("id")
      .eq("owner_id", ownerId)
      .gte("created_at", dayStartIso);

    const emailsSentToday = sentRows?.length ?? 0;
    const repliesToday = inboundRows?.length ?? 0;
    const hotRepliesToday =
      inboundRows?.filter((x: any) => x.classification === "hot").length ?? 0;
    const jobsWonToday = wonRows?.length ?? 0;
    const revenueToday =
      wonRows?.reduce(
        (sum: number, row: any) => sum + Number(row.won_value || 0),
        0
      ) ?? 0;
    const newLeadsToday = newLeads?.length ?? 0;

    const text = `Your SmartSend roofing summary for today:

Emails sent: ${emailsSentToday}
Replies: ${repliesToday}
Hot replies: ${hotRepliesToday}

New leads added: ${newLeadsToday}
Jobs won: ${jobsWonToday}
Revenue from wins today: $${revenueToday.toFixed(2)}

Tip: Reply to hot leads as soon as you see them, and log won jobs in SmartSend to track your revenue.

- SmartSend`;

    try {
      await sendEmail({
        from: "SmartSend Daily <no-reply@smartsendhq.com>",
        to: ownerEmail,
        subject: "SmartSend Daily Roofing Summary",
        text,
      });
      sentCount++;
    } catch (err) {
      console.error("Daily digest email error:", err);
    }
  }

  return NextResponse.json(
    { processed: ownerIds.length, digests_sent: sentCount },
    { status: 200 }
  );
}
