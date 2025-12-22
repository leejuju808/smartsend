#!/usr/bin/env tsx

/**
 * BLOCK 267200 — Verify funnel numbers and pick roofer
 *
 * Requirements to proceed:
 * - Active roofer accounts: 1
 * - Emails sent: >= 175
 * - Replies received: >= 10
 * - Hot/Warm leads: >= 5
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... tsx scripts/block267200_verify_and_pick_roofer.ts
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
  name: string;
  owner_id: string;
  workspace_id: string | null;
  is_active: boolean;
  city: string | null;
  state: string | null;
};

async function countOutreachSent(companyId: string): Promise<number> {
  const { count, error } = await sb
    .from("delivery_logs")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("message_type", "outreach")
    .eq("status", "sent");
  if (error) return 0;
  return count ?? 0;
}

async function countReplies(workspaceId: string | null): Promise<number> {
  if (!workspaceId) return 0;
  const { count, error } = await sb
    .from("inbox_messages")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("direction", "inbound");
  if (error) return 0;
  return count ?? 0;
}

async function countHotWarmLeads(companyId: string): Promise<number> {
  const { count, error } = await sb
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("roofing_company_id", companyId)
    .in("heat_score", ["hot", "warm"]);
  if (error) return 0;
  return count ?? 0;
}

async function main() {
  const { data: companies, error } = await sb
    .from("roofing_companies")
    .select("id, name, owner_id, workspace_id, is_active, city, state")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load roofing_companies:", error.message);
    process.exit(1);
  }

  const activeCompanies = (companies || []) as CompanyRow[];
  console.log(`Active roofing companies: ${activeCompanies.length}`);

  if (activeCompanies.length !== 1) {
    console.error("BLOCK STOP: Expected exactly 1 active roofer account. Fix this first.");
    process.exit(2);
  }

  const c = activeCompanies[0];
  const [sent, replies, hotWarm] = await Promise.all([
    countOutreachSent(c.id),
    countReplies(c.workspace_id),
    countHotWarmLeads(c.id),
  ]);

  const ready = sent >= 175 && replies >= 10 && hotWarm >= 5;

  console.log("");
  console.log(`Company: ${c.name} (${c.id})`);
  console.log(`Owner: ${c.owner_id}`);
  console.log(`Location: ${[c.city, c.state].filter(Boolean).join(", ") || "—"}`);
  console.log("");
  console.log(`Emails sent: ${sent}`);
  console.log(`Replies received: ${replies}`);
  console.log(`Hot/Warm leads: ${hotWarm}`);
  console.log("");

  if (!ready) {
    console.error("BLOCK STOP: Numbers are not true. Do not proceed.");
    process.exit(3);
  }

  console.log("READY: Proceed to charge Starter ($99/mo) this week.");
}

main().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});








