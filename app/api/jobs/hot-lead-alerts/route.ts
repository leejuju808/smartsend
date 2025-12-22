// app/api/jobs/hot-lead-alerts/route.ts
// Block 8640 — Hot Lead Instant Alerts Job
// Finds hot leads that haven't been alerted and sends instant email notifications

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  // 1) Load hot replies that haven't fired an alert yet
  const { data: hotReplies, error } = await supabase
    .from("inbound_emails")
    .select("id, owner_id, lead_id, from_email, subject, body_text, received_at, alert_sent, classification")
    .eq("classification", "hot")
    .eq("alert_sent", false)
    .order("received_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("Hot lead query error:", error);
    return NextResponse.json(
      { error: "Failed to load hot leads" },
      { status: 500 }
    );
  }

  if (!hotReplies || !hotReplies.length) {
    return NextResponse.json(
      { processed: 0 },
      { status: 200 }
    );
  }

  // 2) Map owner_id -> rows
  const byOwner = new Map<string, any[]>();
  for (const row of hotReplies) {
    if (!row.owner_id) continue;
    if (!byOwner.has(row.owner_id)) byOwner.set(row.owner_id, []);
    byOwner.get(row.owner_id)!.push(row);
  }

  // 3) Load notification settings + user emails
  const ownerIds = Array.from(byOwner.keys());

  const { data: settingsRows } = await supabase
    .from("notification_settings")
    .select("*")
    .in("owner_id", ownerIds);

  const settingsMap = new Map(
    (settingsRows ?? []).map((s: any) => [s.owner_id, s])
  );

  // Get user emails from auth.users via admin API or profiles
  const userEmails = new Map<string, string>();
  
  // Try to get emails from profiles table first
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", ownerIds);

  if (profileRows) {
    for (const p of profileRows) {
      if (p.email) {
        userEmails.set(p.id, p.email);
      }
    }
  }

  // Fallback: get emails from auth.users for any missing using admin API
  for (const ownerId of ownerIds) {
    if (!userEmails.has(ownerId)) {
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(ownerId);
        if (authUser?.user?.email) {
          userEmails.set(ownerId, authUser.user.email);
        }
      } catch (e) {
        console.warn(`Could not get email for owner_id ${ownerId}:`, e);
      }
    }
  }

  let notifiedCount = 0;

  // 4) Send alerts per hot reply
  for (const ownerId of ownerIds) {
    const settings = settingsMap.get(ownerId);
    if (settings && settings.notify_hot_leads === false) {
      // Skip alerting but still mark as sent
      const rows = byOwner.get(ownerId) ?? [];
      for (const row of rows) {
        await supabase
          .from("inbound_emails")
          .update({ alert_sent: true })
          .eq("id", row.id);
      }
      continue;
    }

    const ownerEmail = userEmails.get(ownerId);
    if (!ownerEmail) {
      console.warn(`No email found for owner_id: ${ownerId}`);
      continue;
    }

    const rows = byOwner.get(ownerId) ?? [];

    for (const row of rows) {
      try {
        const snippet = (row.body_text || "").slice(0, 220);

        await sendEmail({
          from: "SmartSend Alerts <no-reply@smartsendhq.com>",
          to: ownerEmail,
          subject: "🔥 New Hot Lead Reply",
          text: `You just received a high-intent reply from ${row.from_email}.

Subject: ${row.subject || "(no subject)"}
Received: ${row.received_at}

Preview:
${snippet}

Next steps:
- Open SmartSend
- Go to Inbox → reply quickly
- Or jump into Hot Leads view

(Replying fast increases your chance to win the roof job.)`,
        });

        notifiedCount++;

        await supabase
          .from("inbound_emails")
          .update({ alert_sent: true })
          .eq("id", row.id);
      } catch (err) {
        console.error("Hot lead alert send error:", err);
      }
    }
  }

  return NextResponse.json(
    {
      processed: hotReplies.length,
      alerts_sent: notifiedCount,
    },
    { status: 200 }
  );
}
