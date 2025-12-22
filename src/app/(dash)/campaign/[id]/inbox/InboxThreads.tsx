import * as React from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { IntentBadge } from "@/components/inbox/IntentBadge";

type ThreadRow = {
  id: string;
  lead_id: string;
  campaign_id: string;
  needs_reply: boolean;
  updated_at: string;
  intent?: string | null;
};

type InboxThreadsProps = {
  campaignId: string;
  onSelect: (id: string) => void;
  refreshKey?: number;
};

type Tab = "all" | "needs" | "replied";

function normalizeTab(value: string | null): Tab {
  if (value === "needs" || value === "replied") return value;
  return "all";
}

type IntentFilter = "all" | "interested" | "not_interested" | "neutral" | "out_of_office" | "unsubscribe" | "bounce";

function normalizeIntentFilter(value: string | null): IntentFilter {
  const valid: IntentFilter[] = ["all", "interested", "not_interested", "neutral", "out_of_office", "unsubscribe", "bounce"];
  return valid.includes(value as IntentFilter) ? (value as IntentFilter) : "all";
}

export function InboxThreads({ campaignId, onSelect, refreshKey = 0 }: InboxThreadsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tab, setTab] = React.useState<Tab>(() => normalizeTab(searchParams.get("tab")));
  const [intentFilter, setIntentFilter] = React.useState<IntentFilter>(() => normalizeIntentFilter(searchParams.get("intent")));
  const [q, setQ] = React.useState(() => searchParams.get("q") ?? "");
  const [rows, setRows] = React.useState<ThreadRow[]>([]);
  const [leads, setLeads] = React.useState<Record<string, any>>({});
  const [previews, setPreviews] = React.useState<Record<string, any>>({});
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [count, setCount] = React.useState(0);
  const pageSize = 25;

  React.useEffect(() => {
    const nextTab = normalizeTab(searchParams.get("tab"));
    const nextQ = searchParams.get("q") ?? "";
    setTab((prev) => (prev === nextTab ? prev : nextTab));
    setQ((prev) => (prev === nextQ ? prev : nextQ));
  }, [searchParams]);

  const syncUrl = React.useCallback(
    (nextTab: Tab, nextQ: string, nextPage: number) => {
      const params = new URLSearchParams();
      if (nextTab !== "all") params.set("tab", nextTab);
      if (nextQ) params.set("q", nextQ);
      if (nextPage > 1) params.set("page", String(nextPage));
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router]
  );

  const load = React.useCallback(
    async (targetPage = 1) => {
      setLoading(true);

      const query = new URLSearchParams();
      query.set("tab", tab);
      if (q) query.set("q", q);
      if (intentFilter !== "all") query.set("intent", intentFilter);
      query.set("page", String(targetPage));
      query.set("pageSize", String(pageSize));

      const res = await fetch(`/api/campaign/${campaignId}/inbox/threads?${query.toString()}`);
      const json = await res.json().catch(() => ({}));

      let items = json.items ?? [];
      
      // Filter by intent client-side (MVP)
      if (intentFilter !== "all") {
        items = items.filter((item: ThreadRow) => item.intent === intentFilter);
      }

      setRows(items);
      setLeads(json.leads ?? {});
      setPreviews(json.previews ?? {});
      setCount(json.count ?? 0);
      setPage(json.page ?? targetPage);
      setLoading(false);

      syncUrl(tab, q, json.page ?? targetPage);
    },
    [campaignId, pageSize, q, tab, syncUrl]
  );

  React.useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, intentFilter, refreshKey]);

  const handleSearch = React.useCallback(() => {
    load(1);
  }, [load]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        load(1);
      }
    },
    [load]
  );

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input value={q} onChange={(event) => setQ(event.target.value)} onKeyDown={handleKeyDown} placeholder="Search subject or preview…" />
        <Button variant="outline" onClick={handleSearch}>
          Search
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {(["all", "needs", "replied"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={tab === value ? "default" : "ghost"}
              onClick={() => {
                setTab(value);
                setPage(1);
              }}
            >
              {value === "all" ? "All" : value === "needs" ? "Needs reply" : "Replied"}
            </Button>
          ))}
        </div>
        <Select value={intentFilter} onValueChange={(v) => {
          setIntentFilter(v as IntentFilter);
          setPage(1);
        }}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="All intents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All intents</SelectItem>
            <SelectItem value="interested">Interested</SelectItem>
            <SelectItem value="not_interested">Not interested</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="out_of_office">Out of office</SelectItem>
            <SelectItem value="unsubscribe">Unsubscribe</SelectItem>
            <SelectItem value="bounce">Bounce</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        {loading ? (
          <div className="p-3 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">No threads.</div>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => {
              const lead = leads[row.lead_id];
              const name = lead ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || lead.email || row.lead_id : row.lead_id;
              const preview = previews[row.id] ?? {};
              const subject = preview.last_subject ?? "(no subject)";
              const lastPreview = preview.last_preview ?? "";
              const when = preview.last_at ? new Date(preview.last_at).toLocaleString() : new Date(row.updated_at).toLocaleString();
              const label = preview.last_label ?? null;

              return (
                <li
                  key={row.id}
                  className={cn("cursor-pointer p-3 hover:bg-muted/50", row.needs_reply && "bg-amber-500/5")}
                  onClick={() => onSelect(row.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {name} <span className="text-muted-foreground">• {when}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <IntentBadge intent={row.intent as any} />
                      <div className="text-xs uppercase text-muted-foreground">{row.needs_reply ? "Needs reply" : "Replied"}</div>
                    </div>
                  </div>
                  <div className="truncate text-sm">{subject}</div>
                  <div className="truncate text-xs text-muted-foreground">{lastPreview}</div>
                  {label && <div className="mt-1 text-[10px] uppercase text-muted-foreground">Last label: {label}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => load(page - 1)}>
              Prev
            </Button>
            <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => load(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}


