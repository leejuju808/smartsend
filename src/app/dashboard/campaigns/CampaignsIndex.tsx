"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase";

type Item = {
  id: string;
  name: string;
  owner_id: string;
  deleted_at: string | null;
  role: "owner" | "editor" | "viewer" | null;
  can_edit: boolean;
  updated_at: string;
};

type Counts = {
  all_count: number;
  owned_count: number;
  shared_count: number;
  archived_count: number;
};

const tabs = [
  { key: "all", label: "All", countKey: "all_count" as const },
  { key: "owned", label: "Owned", countKey: "owned_count" as const },
  { key: "shared", label: "Shared with me", countKey: "shared_count" as const },
  { key: "archived", label: "Archived", countKey: "archived_count" as const },
] as const;

export default function CampaignsIndex() {
  const sp = useSearchParams();
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Counts | null>(null);

  const filter = (sp.get("filter") || "all") as typeof tabs[number]["key"];
  const q = sp.get("q") || "";
  const page = Number(sp.get("page") || "1");
  const pageSize = 12;

  function setSearch(next: Partial<{ filter: string; q: string; page: number }>) {
    const params = new URLSearchParams(sp.toString());
    if (next.filter !== undefined) params.set("filter", next.filter);
    if (next.q !== undefined) params.set("q", next.q);
    if (next.page !== undefined) params.set("page", String(next.page));
    router.replace(`/dashboard/campaigns?${params.toString()}`);
  }

  // Fetch campaign counts
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.rpc("campaign_counts");
      if (!mounted) return;
      if (!error && data && data.length > 0) {
        setCounts(data[0]);
      }
    })();
    return () => { mounted = false; };
  }, [supabase]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/campaigns?filter=${filter}&q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`);
      const json = await res.json();
      if (!mounted) return;
      setItems(json.items || []);
      setTotal(json.total || 0);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [filter, q, page]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">City outreach</h1>
        <div className="flex gap-2">
          <input
            className="border rounded-lg px-3 py-2 text-sm"
            placeholder="Search city outreach…"
            defaultValue={q}
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearch({ q: (e.target as HTMLInputElement).value, page: 1 });
            }}
          />
          <button className="px-3 py-2 rounded-lg border" onClick={() => setSearch({ q: "", page: 1 })}>Clear</button>
          <a href="/dashboard/campaigns/new" className="px-3 py-2 rounded-lg bg-black text-white">New City Outreach</a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {tabs.map(t => {
          const count = counts ? counts[t.countKey] : null;
          return (
            <button
              key={t.key}
              className={`px-3 py-2 text-sm flex items-center gap-2 ${filter === t.key ? "border-b-2 border-black font-medium" : "text-muted-foreground"}`}
              onClick={() => setSearch({ filter: t.key, page: 1 })}
            >
              {t.label}
              {count !== null && count > 0 && (
                <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded-full">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonGrid />
      ) : items.length === 0 ? (
        <EmptyState filter={filter} q={q} onReset={() => setSearch({ q: "", page: 1 })} />
      ) : (
        <>
          <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((c) => (
              <li key={c.id} className="border rounded-2xl p-4 hover:shadow-sm transition">
                <div className="flex items-center justify-between">
                  <a className="font-semibold hover:underline" href={`/dashboard/campaigns/${c.id}`}>
                    {c.name || "Untitled city outreach"}
                  </a>
                  <RoleBadge role={c.role} archived={!!c.deleted_at} />
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Updated {new Date(c.updated_at).toLocaleString()}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {c.deleted_at ? (
                    <span className="text-xs">Archived</span>
                  ) : c.can_edit ? (
                    <span className="text-xs">Can edit</span>
                  ) : (
                    <span className="text-xs">View only</span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                className="px-3 py-2 rounded-lg border disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setSearch({ page: page - 1 })}
              >
                Prev
              </button>
              <span className="text-sm">{page} / {pages}</span>
              <button
                className="px-3 py-2 rounded-lg border disabled:opacity-50"
                disabled={page >= pages}
                onClick={() => setSearch({ page: page + 1 })}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RoleBadge({ role, archived }: { role: Item["role"]; archived: boolean }) {
  if (archived) return <span className="text-xs px-2 py-1 rounded-full border">Archived</span>;
  if (role === "owner") return <span className="text-xs px-2 py-1 rounded-full border">Owner</span>;
  if (role === "editor") return <span className="text-xs px-2 py-1 rounded-full border">Editor</span>;
  if (role === "viewer") return <span className="text-xs px-2 py-1 rounded-full border">Viewer</span>;
  return null;
}

function SkeletonGrid() {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="border rounded-2xl p-4 animate-pulse">
          <div className="h-4 w-1/2 bg-gray-200 rounded mb-2" />
          <div className="h-3 w-1/3 bg-gray-200 rounded" />
          <div className="h-6 w-full bg-gray-100 rounded mt-4" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ filter, q, onReset }: { filter: string; q: string; onReset: () => void }) {
  const common = (
    <div className="flex gap-2 mt-4">
      <a href="/dashboard/campaigns/new" className="px-3 py-2 rounded-lg bg-black text-white">Create city outreach</a>
      {q && <button className="px-3 py-2 rounded-lg border" onClick={onReset}>Clear search</button>}
    </div>
  );

  if (filter === "archived") {
    return (
      <div className="border rounded-2xl p-8 text-center">
        <h3 className="font-semibold">No archived city outreach</h3>
        <p className="text-sm text-muted-foreground mt-1">Archive city outreach you no longer need active. They’ll appear here.</p>
      </div>
    );
  }
  if (filter === "shared") {
    return (
      <div className="border rounded-2xl p-8 text-center">
        <h3 className="font-semibold">Nothing shared with you yet</h3>
        <p className="text-sm text-muted-foreground mt-1">Ask a teammate to share a city outreach to collaborate.</p>
      </div>
    );
  }
  return (
    <div className="border rounded-2xl p-8 text-center">
      <h3 className="font-semibold">{q ? "No results" : "No city outreach yet"}</h3>
      <p className="text-sm text-muted-foreground mt-1">
        {q ? "Try a different search term." : "Create your first city outreach to start contacting homeowners."}
      </p>
      {common}
    </div>
  );
}

