#!/usr/bin/env tsx

/**
 * BLOCK 267400 — Lock the Proof + Eliminate Founder Dependency v1
 *
 * Verify aggregated system totals for roofers.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... tsx scripts/block267400_verify_system_totals.ts
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

type CompanyRow = {
  id: string;
  name: string | null;
  workspace_id: string | null;
  is_active: boolean;
};

const PRICE_BY_PLAN: Record<string, number> = {
  starter: 99,
  growth: 199,
  domination: 399,
};

function inRange(n: number, min: number, max: number) {
  return n >= min && n <= max;
}

async function main() {
  const { data: companies, error: compErr } = await sb
    .from("roofing_companies")
    .select("id, name, workspace_id, is_active")
    .eq("is_active", true);

  if (compErr) {
    console.error("Failed to load roofing_companies:", compErr.message);
    process.exit(1);
  }

  const activeCompanies = (companies || []) as CompanyRow[];
  const activeRoofers = activeCompanies.length;
  const companyIds = activeCompanies.map((c) => c.id);
  const workspaceIds = activeCompanies.map((c) => c.workspace_id).filter(Boolean) as string[];

  // Campaigns for active roofer workspaces
  const { data: campaigns, error: campErr } = await sb
    .from("campaigns")
    .select("id")
    .in("workspace_id", workspaceIds);

  if (campErr) {
    console.error("Failed to load campaigns:", campErr.message);
    process.exit(1);
  }

  const campaignIds = (campaigns || []).map((c: any) => c.id).filter(Boolean) as string[];

  const [{ count: emailsSent }, { count: replies }, { count: hotWarm }, { count: bookedCallsRaw }] = await Promise.all([
    // Emails sent: canonical source send_logs
    sb
      .from("send_logs")
      .select("id", { count: "exact", head: true })
      .in("campaign_id", campaignIds)
      .in("status", ["sent", "delivered"]),
    // Replies: canonical source smartsend_reply_events
    sb
      .from("smartsend_reply_events")
      .select("id", { count: "exact", head: true })
      .in("campaign_id", campaignIds),
    // Hot/Warm leads: canonical source leads.outreach_status
    sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("workspace_id", workspaceIds)
      .in("outreach_status", ["hot", "warm"]),
    // Booked calls: appointments created (not cancelled)
    sb
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .in("workspace_id", workspaceIds)
      .neq("status", "cancelled"),
  ]);

  const totalEmailsSent = emailsSent ?? 0;
  const totalReplies = replies ?? 0;
  const totalHotWarm = hotWarm ?? 0;
  const bookedCalls = bookedCallsRaw ?? 0;

  // Paying customers + MRR (company_subscriptions)
  const { data: subs, error: subErr } = await sb
    .from("company_subscriptions")
    .select("company_id, status, plan")
    .in("company_id", companyIds)
    .eq("status", "active");

  if (subErr) {
    console.error("Failed to load company_subscriptions:", subErr.message);
    process.exit(1);
  }

  const activeSubs = (subs || []) as Array<{ company_id: string; status: string; plan: string | null }>;
  const payingCustomers = activeSubs.length;
  const mrr = activeSubs.reduce((sum, s) => sum + (PRICE_BY_PLAN[String(s.plan || "").toLowerCase()] || 0), 0);

  console.log("SYSTEM TOTALS (Active roofers only)");
  console.log("-----------------------------------");
  console.log(`Active roofers: ${activeRoofers}`);
  console.log(`Total emails sent: ${totalEmailsSent}`);
  console.log(`Total replies: ${totalReplies}`);
  console.log(`Hot/Warm leads: ${totalHotWarm}`);
  console.log(`Booked calls: ${bookedCalls}`);
  console.log(`Paying customers: ${payingCustomers}`);
  console.log(`MRR: $${mrr}`);
  console.log("");

  // Hard gate (BLOCK OBJECTIVE)
  const okActiveRoofers = activeRoofers === 2;
  const okEmails = totalEmailsSent >= 350;
  const okReplies = inRange(totalReplies, 28, 42);
  const okHotWarm = inRange(totalHotWarm, 14, 20);
  const okBooked = inRange(bookedCalls, 4, 8);
  const okPaying = payingCustomers === 2;
  const okMrr = mrr === 198;

  const ok = okActiveRoofers && okEmails && okReplies && okHotWarm && okBooked && okPaying && okMrr;

  if (!ok) {
    console.error("BLOCK STOP: Aggregated totals do not match the required proof numbers.");
    console.error("Details:");
    console.error(`- active_roofers == 2: ${okActiveRoofers}`);
    console.error(`- emails_sent >= 350: ${okEmails}`);
    console.error(`- replies in [28, 42]: ${okReplies}`);
    console.error(`- hot_warm in [14, 20]: ${okHotWarm}`);
    console.error(`- booked_calls in [4, 8]: ${okBooked}`);
    console.error(`- paying_customers == 2: ${okPaying}`);
    console.error(`- mrr == 198: ${okMrr}`);
    process.exit(2);
  }

  console.log("READY: Proof numbers are true. Proceed with Revenue Activity screen.");
}

main().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});








