// app/dashboard/leads/_components/LeadsClient.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

type LeadRow = {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  email: string | null;
  name: string | null;
  status: string;
  source: string | null;
  estimated_value: number | null;
  currency: string | null;
  created_at: string;
  latest_intent: string | null;
  latest_reply_at: string | null;
  reply_count: number | null;
};

interface Props {
  leads: LeadRow[];
}

type StatusFilter = "all" | "new" | "in_progress" | "won" | "lost";
type IntentFilter = "all" | "hot" | "warm" | "not_interested";

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return "—";
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  } catch {
    return dateString;
  }
}

function formatCurrency(
  value: number | null | undefined,
  currency?: string | null
): string {
  if (value == null) return "—";
  const cur = currency || "USD";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 0,
  });
}

function statusBadge(status: string) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-medium";

  const map: Record<string, string> = {
    new: "border-blue-600 bg-blue-500/10 text-blue-700",
    in_progress: "border-yellow-500 bg-yellow-500/10 text-yellow-700",
    won: "border-emerald-600 bg-emerald-500/10 text-emerald-700",
    lost: "border-gray-500 bg-gray-500/10 text-gray-400",
  };

  const cls = map[status] ?? "border-blue-600 bg-blue-500/10 text-blue-700";

  return <span className={`${base} ${cls}`}>{status}</span>;
}

function intentChip(intent: string | null) {
  if (!intent) return null;

  const base =
    "inline-flex items-center rounded-full border px-2 py-[1px] text-[9px] font-medium";

  if (intent === "hot") {
    return (
      <span className={`${base} border-red-600 bg-red-500/10 text-red-600`}>
        Hot
      </span>
    );
  }
  if (intent === "warm") {
    return (
      <span
        className={`${base} border-yellow-500 bg-yellow-500/10 text-yellow-600`}
      >
        Warm
      </span>
    );
  }
  if (intent === "not_interested") {
    return (
      <span
        className={`${base} border-gray-500 bg-gray-500/10 text-gray-400`}
      >
        Not interested
      </span>
    );
  }

  return (
    <span
      className={`${base} border-blue-600 bg-blue-500/10 text-blue-600`}
    >
      {intent}
    </span>
  );
}

export default function LeadsClient({ leads }: Props) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [intentFilter, setIntentFilter] = useState<IntentFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      if (statusFilter !== "all" && lead.status !== statusFilter) {
        return false;
      }

      if (intentFilter !== "all") {
        const i = (lead.latest_intent || "").toLowerCase();
        if (i !== intentFilter) return false;
      }

      if (search.trim()) {
        const needle = search.toLowerCase();
        const haystack =
          `${lead.name ?? ""} ${lead.email ?? ""} ${lead.source ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      return true;
    });
  }, [leads, statusFilter, intentFilter, search]);

  const totalValue = useMemo(() => {
    return filtered.reduce((sum, l) => sum + (l.estimated_value ?? 0), 0);
  }, [filtered]);

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Header + metrics */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Every homeowner SmartSend has turned into an opportunity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="rounded-xl border bg-card px-3 py-2">
            <p className="text-[11px] text-muted-foreground">
              Total leads (filtered)
            </p>
            <p className="mt-[2px] text-sm font-semibold tabular-nums">
              {filtered.length}
            </p>
          </div>
          <div className="rounded-xl border bg-card px-3 py-2">
            <p className="text-[11px] text-muted-foreground">
              Est. pipeline value
            </p>
            <p className="mt-[2px] text-sm font-semibold tabular-nums">
              {formatCurrency(totalValue)}
            </p>
          </div>
        </div>
      </header>

      {/* Filters */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium">Status</span>
          {(["all", "new", "in_progress", "won", "lost"] as StatusFilter[]).map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-full border px-3 py-[3px] text-[11px] ${
                  statusFilter === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground"
                }`}
              >
                {s === "all"
                  ? "All"
                  : s === "in_progress"
                  ? "In progress"
                  : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            )
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium">Intent</span>
          {(["all", "hot", "warm", "not_interested"] as IntentFilter[]).map(
            (i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIntentFilter(i)}
                className={`rounded-full border px-3 py-[3px] text-[11px] ${
                  intentFilter === i
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground"
                }`}
              >
                {i === "all"
                  ? "All"
                  : i === "not_interested"
                  ? "Not interested"
                  : i.charAt(0).toUpperCase() + i.slice(1)}
              </button>
            )
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            className="w-52 rounded-full border bg-background px-3 py-[6px] text-[11px] outline-none ring-0 focus:border-primary"
            placeholder="Search name, email, source…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </section>

      {/* Table */}
      <section className="flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="grid grid-cols-6 gap-2 border-b px-4 py-2 text-[11px] font-medium text-muted-foreground">
          <div className="col-span-2">Lead</div>
          <div>Intent</div>
          <div>Est. value</div>
          <div>Source</div>
          <div className="text-right">Last reply</div>
        </div>

        <div className="h-[calc(100vh-280px)] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 py-8">
              <p className="text-sm text-muted-foreground">
                No leads match these filters yet.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((lead) => {
                const name =
                  lead.name?.trim() ||
                  (lead.email ? lead.email : "Unnamed lead");

                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                    className="grid w-full grid-cols-6 gap-2 px-4 py-2 text-left text-xs hover:bg-muted/60"
                  >
                    <div className="col-span-2 flex flex-col gap-[2px]">
                      <span className="text-[11px] font-semibold">
                        {name}
                      </span>
                      {lead.email && (
                        <span className="text-[11px] text-muted-foreground">
                          {lead.email}
                        </span>
                      )}
                      <div className="mt-[2px] flex items-center gap-1">
                        {statusBadge(lead.status)}
                        {lead.reply_count && lead.reply_count > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {lead.reply_count} repl
                            {lead.reply_count === 1 ? "y" : "ies"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center">
                      {intentChip(lead.latest_intent)}
                    </div>

                    <div className="flex items-center text-[11px]">
                      {formatCurrency(lead.estimated_value, lead.currency)}
                    </div>

                    <div className="flex items-center text-[11px] text-muted-foreground">
                      {lead.source || "—"}
                    </div>

                    <div className="flex items-center justify-end text-[11px] text-muted-foreground">
                      {formatTimeAgo(lead.latest_reply_at)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}


























































