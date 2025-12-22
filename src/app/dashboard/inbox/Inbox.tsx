"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type Thread = {
  id: string;
  campaign_id: string;
  lead_id: string;
  subject: string | null;
  assigned_to: string | null;
  status: "open"|"snoozed"|"closed";
  last_message_at: string | null;
  last_direction: "in"|"out"|null;
  unread_count: number;
  updated_at: string;
};

const tabDefs = [
  { key: "mine", label: "Mine" },
  { key: "all", label: "All" },
  { key: "unassigned", label: "Unassigned" },
  { key: "closed", label: "Closed" },
] as const;

export default function Inbox() {
  const sp = useSearchParams();
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const tab = (sp.get("tab") || "mine") as typeof tabDefs[number]["key"];
  const q = sp.get("q") || "";

  useEffect(() => {
    // Fetch current user ID
    fetch("/api/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.id) setCurrentUserId(data.id);
      })
      .catch(() => {});
  }, []);

  function setQuery(next: Partial<{ tab: string; q: string }>) {
    const p = new URLSearchParams(sp.toString());
    if (next.tab !== undefined) p.set("tab", next.tab);
    if (next.q !== undefined) p.set("q", next.q);
    router.replace(`/dashboard/inbox?${p.toString()}`);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/inbox?tab=${tab}&q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!mounted) return;
      setThreads(json.items || []);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [tab, q]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inbox</h1>
        <div className="flex gap-2">
          <input
            className="border rounded-lg px-3 py-2 text-sm"
            placeholder="Search subject or lead…"
            defaultValue={q}
            onKeyDown={(e) => e.key === "Enter" && setQuery({ q: (e.target as HTMLInputElement).value })}
          />
          <button className="px-3 py-2 rounded-lg border" onClick={() => setQuery({ q: "" })}>Clear</button>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        {tabDefs.map(t => (
          <button
            key={t.key}
            className={`px-3 py-2 text-sm ${tab === t.key ? "border-b-2 border-black font-medium" : "text-muted-foreground"}`}
            onClick={() => setQuery({ tab: t.key })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : threads.length === 0 ? (
        <div className="border rounded-2xl p-8 text-center">
          <h3 className="font-semibold">No conversations</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {tab === "mine" ? "Nothing assigned to you yet." :
             tab === "unassigned" ? "No unassigned threads." :
             tab === "closed" ? "Closed threads will show here." :
             "Try another filter."}
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {threads.map(t => (
            <li key={t.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  {t.unread_count > 0 && <span className="text-xs px-2 py-0.5 rounded-full border">Unread {t.unread_count}</span>}
                  <a className="font-medium hover:underline" href={`/dashboard/inbox/${t.id}`}>
                    {t.subject || "No subject"}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    · {t.last_direction === "in" ? "Incoming" : "Outgoing"} · {new Date(t.last_message_at || t.updated_at || Date.now()).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Status: {t.status}{t.assigned_to ? " · Assigned" : " · Unassigned"}
                </div>
              </div>
              <AssignMenu thread={t} currentUserId={currentUserId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssignMenu({ thread, currentUserId }: { thread: Thread; currentUserId: string | null }) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  async function assign(user_id: string | null) {
    await fetch(`/api/threads/${thread.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id }),
    });
    location.reload(); // keep it simple; can swap to SWR mutate
  }
  async function setStatus(status: "open"|"snoozed"|"closed") {
    await fetch(`/api/threads/${thread.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setShowStatusMenu(false);
    location.reload();
  }
  return (
    <div className="flex gap-2">
      <button className="px-2 py-1 border rounded text-sm" onClick={() => assign(null)}>Unassign</button>
      {currentUserId && (
        <button className="px-2 py-1 border rounded text-sm" onClick={() => assign("me")}>
          Assign to me
        </button>
      )}
      <div className="relative">
        <button 
          className="px-2 py-1 border rounded text-sm" 
          onClick={() => setShowStatusMenu(!showStatusMenu)}
        >
          Status ▾
        </button>
        {showStatusMenu && (
          <div className="absolute right-0 bg-white border rounded mt-1 text-sm z-10 shadow-lg">
            <button className="block w-full text-left px-3 py-2 hover:bg-gray-100" onClick={() => setStatus("open")}>Open</button>
            <button className="block w-full text-left px-3 py-2 hover:bg-gray-100" onClick={() => setStatus("snoozed")}>Snoozed</button>
            <button className="block w-full text-left px-3 py-2 hover:bg-gray-100" onClick={() => setStatus("closed")}>Closed</button>
          </div>
        )}
      </div>
    </div>
  );
}
