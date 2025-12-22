import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_WEBHOOK = Deno.env.get("SLACK_WEBHOOK_URL") ?? "";

type Row = {
  account_id: string;
  day: string;
  candidates: number | null;
  auto_merged: number | null;
  manual_merges: number | null;
  undos: number | null;
  errors: number | null;
  total_events: number | null;
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Totals = {
  candidates: number;
  auto_merged: number;
  manual_merges: number;
  undos: number;
  errors: number;
  total_events: number;
};

Deno.serve(async (req) => {
  if (!SLACK_WEBHOOK) {
    console.error("Missing SLACK_WEBHOOK_URL environment variable");
    return new Response("missing webhook", { status: 500 });
  }

  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");

  const since = new Date();
  since.setDate(since.getDate() - 1);
  const sinceIso = since.toISOString();

  let builder = supabase
    .from("dupe_quality_daily")
    .select("*")
    .gte("day", sinceIso);

  if (accountId) {
    builder = builder.eq("account_id", accountId);
  }

  const { data, error } = await builder.returns<Row[]>();

  if (error) {
    console.error("Failed to fetch dupe_quality_daily", error);
    await postSlack(`⚠️ Nightly report failed: ${error.message}`);
    return new Response("error", { status: 500 });
  }

  const totals = (data ?? []).reduce<Totals>(
    (acc, row) => ({
      candidates: acc.candidates + (row.candidates ?? 0),
      auto_merged: acc.auto_merged + (row.auto_merged ?? 0),
      manual_merges: acc.manual_merges + (row.manual_merges ?? 0),
      undos: acc.undos + (row.undos ?? 0),
      errors: acc.errors + (row.errors ?? 0),
      total_events: acc.total_events + (row.total_events ?? 0),
    }),
    {
      candidates: 0,
      auto_merged: 0,
      manual_merges: 0,
      undos: 0,
      errors: 0,
      total_events: 0,
    }
  );

  const text = formatSlackMessage(totals);
  await postSlack(text);

  return new Response("ok", { status: 200 });
});

function formatSlackMessage(totals: Totals) {
  const timestamp = new Date().toLocaleString();
  return [
    "*SmartSend — Nightly Duplicates Report*",
    `• Candidates: *${totals.candidates}*`,
    `• Auto-merged: *${totals.auto_merged}* • Manual merges: *${totals.manual_merges}* • Undos: *${totals.undos}*`,
    `• Errors: *${totals.errors}* (last 24h)`,
    `_${timestamp}_`,
  ].join("\n");
}

async function postSlack(text: string) {
  const res = await fetch(SLACK_WEBHOOK, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    console.error("Failed to post Slack message", await res.text());
  }
}



