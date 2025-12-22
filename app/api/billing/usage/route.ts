// app/api/billing/usage/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/supabase/types";

type UsageResponse = {
  plan_code: string;
  email_quota: number | null; // null = unlimited
  emails_sent: number;
  emails_remaining: number | null;
  percent_used: number | null;
  period_start: string;
  period_end: string;
};

function quotaForPlan(plan: string): number | null {
  switch (plan) {
    case "starter":
      return 500;
    case "growth":
      return 2000;
    case "domination":
      return null; // unlimited
    default:
      return 200; // trial / default
  }
}

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Not signed in → no usage
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const resp: UsageResponse = {
      plan_code: "trial",
      email_quota: 200,
      emails_sent: 0,
      emails_remaining: 200,
      percent_used: 0,
      period_start: monthStart.toISOString(),
      period_end: monthEnd.toISOString(),
    };
    return NextResponse.json(resp, { status: 200 });
  }

  const ownerId = user.id;

  // 1) Get subscription record (if any)
  const { data: subRow } = await supabase
    .from("workspace_subscriptions")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();

  let plan_code = subRow?.plan_code ?? "trial";

  // Use subscription period if present, else this calendar month
  let periodStart: Date;
  let periodEnd: Date;
  if (subRow?.current_period_start && subRow?.current_period_end) {
    periodStart = new Date(subRow.current_period_start);
    periodEnd = new Date(subRow.current_period_end);
  } else {
    const now = new Date();
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  const periodStartIso = periodStart.toISOString();
  const periodEndIso = periodEnd.toISOString();

  const email_quota = quotaForPlan(plan_code);

  // 2) Count emails sent in this period
  const { count: sentCount, error: sentError } = await supabase
    .from("outbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("status", "sent")
    .gte("sent_at", periodStartIso)
    .lt("sent_at", periodEndIso);

  if (sentError) {
    console.error("Billing usage error:", sentError);
  }

  const emails_sent = sentCount ?? 0;
  const emails_remaining =
    email_quota != null ? Math.max(email_quota - emails_sent, 0) : null;
  const percent_used =
    email_quota != null && email_quota > 0
      ? Math.min((emails_sent / email_quota) * 100, 100)
      : null;

  const resp: UsageResponse = {
    plan_code,
    email_quota,
    emails_sent,
    emails_remaining,
    percent_used,
    period_start: periodStartIso,
    period_end: periodEndIso,
  };

  return NextResponse.json(resp, { status: 200 });
}
