// app/api/jobs/send-pending/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { sendEmail } from "@/lib/email";

type PendingEmailRow = {
  id: string;
  owner_id: string | null;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
};

export async function POST(req: NextRequest) {
  // This endpoint should be secured (cron secret, IP allowlist, etc.)
  // Verify CRON secret if provided
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Missing Supabase configuration" },
      { status: 500 }
    );
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

  const nowIso = new Date().toISOString();
  const batchSize = 50; // send up to 50 emails per run

  // 1) Pull a batch of pending emails
  const { data: pending, error: pendingError } = await supabase
    .from("outbound_emails")
    .select("id, owner_id, to_email, subject, body_text")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .not("to_email", "is", null)
    .limit(batchSize);

  if (pendingError) {
    console.error("Error fetching pending emails:", pendingError);
    return NextResponse.json(
      { error: "Failed to fetch pending emails" },
      { status: 500 }
    );
  }

  if (!pending || !pending.length) {
    return NextResponse.json(
      { processed: 0, message: "No pending emails to send" },
      { status: 200 }
    );
  }

  // 2) Fetch suppression list for affected emails
  const emails = Array.from(
    new Set(
      pending
        .map((p) => p.to_email?.toLowerCase().trim())
        .filter(Boolean) as string[]
    )
  );

  const { data: suppressedRows } = await supabase
    .from("suppression_list_global")
    .select("email")
    .in("email", emails);

  const suppressedSet = new Set(
    (suppressedRows ?? []).map((r) => r.email.toLowerCase().trim())
  );

  // 3) Group emails by owner_id to reduce DB lookups
  const ownerIds = Array.from(
    new Set(pending.map((p) => p.owner_id).filter(Boolean)) as Set<string>
  );

  const { data: settingsRows, error: settingsError } = await supabase
    .from("workspace_sending_settings")
    .select("*")
    .in("owner_id", ownerIds);

  if (settingsError) {
    console.error("Error loading sending settings:", settingsError);
    return NextResponse.json(
      { error: "Failed to load sending settings" },
      { status: 500 }
    );
  }

  const settingsMap = new Map(
    (settingsRows ?? []).map((s: any) => [s.owner_id, s])
  );

  // 4) Load subscriptions and compute usage per owner
  const { data: subsRows } = await supabase
    .from("workspace_subscriptions")
    .select("*")
    .in("owner_id", ownerIds);

  const subsMap = new Map(
    (subsRows ?? []).map((r: any) => [r.owner_id, r])
  );

  // Helper to compute period window per owner
  function getPeriodFor(ownerId: string): { startIso: string; endIso: string } {
    const sub = subsMap.get(ownerId);
    if (sub?.current_period_start && sub?.current_period_end) {
      return {
        startIso: sub.current_period_start,
        endIso: sub.current_period_end,
      };
    }
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }

  function quotaForPlan(plan: string | null | undefined): number | null {
    switch (plan) {
      case "starter":
        return 500;
      case "growth":
        return 2000;
      case "domination":
        return null;
      default:
        return 200; // trial / fallback
    }
  }

  // Load current usage per owner
  const ownerUsage = new Map<
    string,
    { plan_code: string; quota: number | null; used: number; periodStart: string; periodEnd: string }
  >();

  for (const ownerId of ownerIds) {
    const sub = subsMap.get(ownerId);
    const plan_code = sub?.plan_code ?? "trial";
    const quota = quotaForPlan(plan_code);
    const { startIso, endIso } = getPeriodFor(ownerId);
    const { count } = await supabase
      .from("outbound_emails")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .eq("status", "sent")
      .gte("sent_at", startIso)
      .lt("sent_at", endIso);

    ownerUsage.set(ownerId, {
      plan_code,
      quota,
      used: count ?? 0,
      periodStart: startIso,
      periodEnd: endIso,
    });
  }

  let successCount = 0;
  let failCount = 0;

  // 5) Process each email
  for (const email of pending as PendingEmailRow[]) {
    if (!email.owner_id) {
      console.warn("Skipping email with no owner_id", email.id);
      failCount++;
      await supabase
        .from("outbound_emails")
        .update({
          status: "failed",
          sent_at: new Date().toISOString(),
        })
        .eq("id", email.id);
      continue;
    }

    const settings = settingsMap.get(email.owner_id);
    if (!settings) {
      console.warn("No sending settings for owner", email.owner_id);
      failCount++;
      await supabase
        .from("outbound_emails")
        .update({
          status: "failed",
          sent_at: new Date().toISOString(),
        })
        .eq("id", email.id);
      continue;
    }

    const from = `${settings.from_name} <${settings.from_email}>`;
    const to = email.to_email?.trim().toLowerCase();
    const subject = email.subject || "";

    if (!to || !to.includes("@")) {
      console.warn("Invalid to_email for outbound email", email.id);
      failCount++;
      await supabase
        .from("outbound_emails")
        .update({
          status: "failed",
          sent_at: new Date().toISOString(),
        })
        .eq("id", email.id);
      continue;
    }

    // Check if email is suppressed
    if (suppressedSet.has(to)) {
      console.warn("Skipping suppressed email", email.id, to);
      failCount++;
      await supabase
        .from("outbound_emails")
        .update({
          status: "canceled",
          sent_at: new Date().toISOString(),
        })
        .eq("id", email.id);
      continue;
    }

    // Check plan quota before sending
    const usage = ownerUsage.get(email.owner_id);
    if (!usage) {
      // No subscription; treat as trial
      ownerUsage.set(email.owner_id, {
        plan_code: "trial",
        quota: 200,
        used: 0,
        periodStart: "",
        periodEnd: "",
      });
    }

    const current = ownerUsage.get(email.owner_id)!;

    // If there is a quota and it's already hit, cancel for quota reason
    if (current.quota != null && current.used >= current.quota) {
      console.warn(
        "Quota reached for owner",
        email.owner_id,
        "canceling email",
        email.id
      );
      failCount++;
      await supabase
        .from("outbound_emails")
        .update({
          status: "canceled",
          cancel_reason: "plan_quota_reached",
          sent_at: new Date().toISOString(),
        })
        .eq("id", email.id);
      continue;
    }

    // Add unsubscribe footer to email body
    const baseText = email.body_text || "";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.smartsendhq.com";
    const unsubscribeUrl = `${appUrl}/unsubscribe?email=${encodeURIComponent(to)}`;
    const text =
      baseText +
      `\n\n---\nIf you no longer wish to receive emails about roofing services, you can unsubscribe here: ${unsubscribeUrl}`;

    try {
      const result = await sendEmail({
        from,
        to,
        subject,
        text,
      });

      if (result.success) {
        await supabase
          .from("outbound_emails")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", email.id);

        // Track usage in-memory
        const currentUsage = ownerUsage.get(email.owner_id);
        if (currentUsage) {
          currentUsage.used += 1;
        }

        successCount++;
      } else {
        console.error("Email send failed", email.id, result.error);
        failCount++;
        await supabase
          .from("outbound_emails")
          .update({
            status: "failed",
            sent_at: new Date().toISOString(),
          })
          .eq("id", email.id);
      }
    } catch (err) {
      console.error("Error sending email", email.id, err);
      failCount++;
      await supabase
        .from("outbound_emails")
        .update({
          status: "failed",
          sent_at: new Date().toISOString(),
        })
        .eq("id", email.id);
    }
  }

  return NextResponse.json(
    {
      processed: pending.length,
      sent: successCount,
      failed: failCount,
    },
    { status: 200 }
  );
}

