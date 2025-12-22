import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

type Row = {
  account_id: string;
  day: string;
  candidates: number | null;
  auto_merged: number | null;
  manual_merges: number | null;
  undos: number | null;
  errors: number | null;
};

export async function GET() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SLACK_WEBHOOK_URL) {
    return NextResponse.json(
      { error: "Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SLACK_WEBHOOK_URL" },
      { status: 500 }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("dupe_quality_daily")
    .select("*")
    .gte("day", since);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Row[];
  const text = summarize(rows);

  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `Slack webhook failed: ${body}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

function summarize(rows: Row[]) {
  const totals = rows.reduce(
    (acc, row) => ({
      candidates: acc.candidates + (row.candidates ?? 0),
      auto_merged: acc.auto_merged + (row.auto_merged ?? 0),
      manual_merges: acc.manual_merges + (row.manual_merges ?? 0),
      undos: acc.undos + (row.undos ?? 0),
      errors: acc.errors + (row.errors ?? 0),
    }),
    { candidates: 0, auto_merged: 0, manual_merges: 0, undos: 0, errors: 0 }
  );

  return [
    "*SmartSend — Nightly Duplicates Report*",
    `• Candidates: *${totals.candidates}*`,
    `• Auto-merged: *${totals.auto_merged}* • Manual merges: *${totals.manual_merges}* • Undos: *${totals.undos}*`,
    `• Errors: *${totals.errors}* (24h)`,
  ].join("\n");
}



