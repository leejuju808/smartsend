import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

function startOfWeekMondayUTC(d: Date) {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
  );
  // JS: Sunday=0..Saturday=6. Convert so Monday=0..Sunday=6.
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date;
}

async function distinctContactsInRange({
  supabase,
  accountId,
  column,
  fromIso,
  toIso,
}: {
  supabase: any;
  accountId: string;
  column: "last_outbound_at" | "last_inbound_at";
  fromIso: string;
  toIso: string;
}) {
  const seen = new Set<string>();
  const pageSize = 1000;

  for (let page = 0; page < 200; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("contact_id")
      .eq("account_id", accountId)
      .not(column, "is", null)
      .gte(column, fromIso)
      .lte(column, toIso)
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row?.contact_id) seen.add(String(row.contact_id));
    }
  }

  return seen.size;
}

async function sumWonRevenueInRange({
  supabase,
  workspaceId,
  fromIso,
  toIso,
}: {
  supabase: any;
  workspaceId: string;
  fromIso: string;
  toIso: string;
}) {
  let count = 0;
  let value = 0;
  const pageSize = 1000;

  for (let page = 0; page < 200; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("leads")
      .select("actual_value, estimated_job_value")
      .eq("workspace_id", workspaceId)
      .eq("pipeline_stage", "won")
      .gte("closed_at", fromIso)
      .lte("closed_at", toIso)
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    count += data.length;
    for (const row of data) {
      const v = row?.actual_value ?? row?.estimated_job_value ?? 0;
      value += Number(v) || 0;
    }
  }

  return { jobsClosed: count, cashExpected: value };
}

async function realityForRange({
  supabase,
  workspaceId,
  accountId,
  fromIso,
  toIso,
}: {
  supabase: any;
  workspaceId: string;
  accountId: string;
  fromIso: string;
  toIso: string;
}) {
  let homeownersContacted = 0;
  let replies = 0;
  let jobsBooked = 0;
  let jobsClosed = 0;
  let cashExpected = 0;

  try {
    [homeownersContacted, replies] = await Promise.all([
      distinctContactsInRange({
        supabase,
        accountId,
        column: "last_outbound_at",
        fromIso,
        toIso,
      }),
      distinctContactsInRange({
        supabase,
        accountId,
        column: "last_inbound_at",
        fromIso,
        toIso,
      }),
    ]);
  } catch {
    homeownersContacted = 0;
    replies = 0;
  }

  try {
    const { count } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .neq("status", "cancelled")
      .gte("created_at", fromIso)
      .lte("created_at", toIso);
    jobsBooked = count ?? 0;
  } catch {
    jobsBooked = 0;
  }

  try {
    const won = await sumWonRevenueInRange({
      supabase,
      workspaceId,
      fromIso,
      toIso,
    });
    jobsClosed = won.jobsClosed;
    cashExpected = won.cashExpected;
  } catch {
    jobsClosed = 0;
    cashExpected = 0;
  }

  return { homeownersContacted, replies, jobsBooked, jobsClosed, cashExpected };
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  );
  const weekStart = startOfWeekMondayUTC(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

  const [today, week, month] = await Promise.all([
    realityForRange({
      supabase,
      workspaceId,
      accountId: user.id,
      fromIso: todayStart.toISOString(),
      toIso: nowIso,
    }),
    realityForRange({
      supabase,
      workspaceId,
      accountId: user.id,
      fromIso: weekStart.toISOString(),
      toIso: nowIso,
    }),
    realityForRange({
      supabase,
      workspaceId,
      accountId: user.id,
      fromIso: monthStart.toISOString(),
      toIso: nowIso,
    }),
  ]);

  return NextResponse.json(
    {
      ok: true,
      as_of: nowIso,
      today,
      week,
      month,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}



