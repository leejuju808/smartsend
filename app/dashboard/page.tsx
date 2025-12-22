import { redirect } from "next/navigation";
import { Metadata } from "next";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
 

export const metadata: Metadata = {
  title: "Dashboard · SmartSend",
};

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

function fmtCurrency(v: number) {
  return v.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default async function DashboardPage() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    redirect("/welcome");
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  );
  const weekStart = startOfWeekMondayUTC(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

  async function realityForRange(fromIso: string, toIso: string) {
    let homeownersContacted = 0;
    let replies = 0;
    let jobsBooked = 0;
    let jobsClosed = 0;
    let cashExpected = 0;

    try {
      [homeownersContacted, replies] = await Promise.all([
        distinctContactsInRange({
          supabase,
          accountId: user.id,
          column: "last_outbound_at",
          fromIso,
          toIso,
        }),
        distinctContactsInRange({
          supabase,
          accountId: user.id,
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

  const [today, week, month] = await Promise.all([
    realityForRange(todayStart.toISOString(), nowIso),
    realityForRange(weekStart.toISOString(), nowIso),
    realityForRange(monthStart.toISOString(), nowIso),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5">
        <div className="text-[0.7rem] uppercase tracking-wide text-neutral-500">
          Reality
        </div>
        <div className="mt-1 text-2xl font-semibold text-neutral-50">
          One screen. One truth.
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="/inbox"
            className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900"
          >
            Reply
          </a>
          <a
            href="/dashboard/jobs"
            className="rounded-xl border border-neutral-700 bg-neutral-950/60 px-4 py-2 text-sm font-semibold text-neutral-100"
          >
            Book
          </a>
          <a
            href="/dashboard/jobs"
            className="rounded-xl border border-neutral-700 bg-neutral-950/60 px-4 py-2 text-sm font-semibold text-neutral-100"
          >
            Close
          </a>
        </div>
        <div className="mt-2 text-xs text-neutral-500">
          Ignore is handled by the system.
        </div>
      </header>

      <RealityBlock title="Today’s reality" data={today} />
      <RealityBlock title="This week’s reality" data={week} />
      <RealityBlock title="This month’s reality" data={month} />
    </div>
  );
}

function RealityBlock({
  title,
  data,
}: {
  title: string;
  data: {
    homeownersContacted: number;
    replies: number;
    jobsBooked: number;
    jobsClosed: number;
    cashExpected: number;
  };
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        <Kpi label="Homeowners contacted" value={data.homeownersContacted} />
        <Kpi label="Replies" value={data.replies} />
        <Kpi label="Jobs booked" value={data.jobsBooked} />
        <Kpi label="Jobs closed" value={data.jobsClosed} />
        <Kpi label="Cash expected" value={fmtCurrency(data.cashExpected)} emphasize />
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string | number;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
      <div className="text-[0.7rem] uppercase tracking-wide text-neutral-500">{label}</div>
      <div
        className={[
          "mt-2 text-3xl font-semibold tabular-nums",
          emphasize ? "text-emerald-400" : "text-neutral-50",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}
