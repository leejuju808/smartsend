"use client";

import useSWRInfinite from "swr/infinite";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "bg-green-500"
      : score >= 50
        ? "bg-yellow-500"
        : score >= 30
          ? "bg-orange-500"
          : "bg-gray-400";
  return (
    <Badge className={cn(tone, "text-white")}>{Math.round(score ?? 0)}</Badge>
  );
}

const labelColor: Record<string, string> = {
  action_required: "bg-red-500",
  question: "bg-amber-500",
  routing: "bg-blue-500",
  positive: "bg-emerald-600",
  neutral: "bg-slate-500",
  ooo: "bg-purple-500",
  oos: "bg-indigo-500",
  meeting_intent: "bg-emerald-700",
  not_interested: "bg-zinc-600",
  bounce: "bg-gray-600",
};

type InboxResponse = {
  items: any[];
  nextOffset: number;
};

export default function InboxList() {
  const getKey = (pageIndex: number, prev: InboxResponse | null) => {
    if (prev && prev.items?.length === 0) return null;
    const sp = new URLSearchParams(window.location.search);
    sp.set("limit", "50");
    sp.set("offset", String(pageIndex * 50));
    return `/api/inbox?${sp.toString()}`;
  };

  const { data, size, setSize } = useSWRInfinite<InboxResponse>(
    getKey,
    (url) => fetch(url).then((r) => r.json()),
  );

  const items = data?.flatMap((d) => d.items ?? []) ?? [];

  const unread = items.filter((i: any) => (i.unread_count ?? 0) > 0);
  const read = items.filter((i: any) => (i.unread_count ?? 0) === 0);

  const loadMore = () => setSize(size + 1);

  return (
    <div className="space-y-6">
      {unread.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Unread</h3>
          <div className="divide-y rounded-xl border">
            {unread.map((t: any) => (
              <ThreadRow key={t.thread_id} t={t} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold">Read</h3>
        <div className="divide-y rounded-xl border">
          {read.map((t: any) => (
            <ThreadRow key={t.thread_id} t={t} />
          ))}
        </div>
      </section>

      <div className="flex justify-center">
        <button
          className="mt-4 rounded-lg border px-4 py-2"
          onClick={loadMore}
        >
          Load more
        </button>
      </div>
    </div>
  );
}

function ThreadRow({ t }: { t: any }) {
  const chip = t.primary_label
    ? labelColor[t.primary_label] ?? "bg-slate-600"
    : "bg-slate-600";
  const lastAt = t.last_msg_at ? new Date(t.last_msg_at) : null;

  return (
    <a
      href={`/inbox/thread/${t.thread_id}`}
      className="flex items-center justify-between p-3 hover:bg-muted/50"
    >
      <div className="flex items-center gap-3">
        {(t.unread_count ?? 0) > 0 && (
          <span className="h-2 w-2 rounded-full bg-blue-600" />
        )}
        <div>
          <div className="font-medium">
            {t.lead_name || t.lead_email || "Unknown lead"}
          </div>
          {lastAt && (
            <div className="text-xs text-muted-foreground">
              {lastAt.toLocaleString()}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {t.primary_label && (
          <Badge className={cn(chip, "capitalize text-white")}>
            {String(t.primary_label).replace(/_/g, " ")}
          </Badge>
        )}
        <ScoreBadge score={t.relevance_score ?? 0} />
      </div>
    </a>
  );
}


