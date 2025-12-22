// app/(app)/inbox/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type InboxItem = {
  id: string;
  subject: string | null;
  body: string;
  created_at: string;
  intent_label: string | null;
  contacts: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    city: string | null;
    lead_status: string | null;
    est_job_value: number | null;
    owner_user_id: string | null; // Block 16300
  } | null;
  campaigns: {
    id: string;
    name: string | null;
  } | null;
  owner?: { // Block 16300: Owner info from join
    id: string;
    email: string;
    full_name: string | null;
  } | null;
};

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<
    "active" | "all" | "hot_lead" | "warm_lead" | "follow_up"
  >("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/inbox?intent=${filter}`);
      const json = await res.json();
      setItems(json.items || []);
      if (!selectedId && json.items?.[0]) {
        setSelectedId(json.items[0].id);
      }
      setLoading(false);
    }
    load();
  }, [filter]);

  const selected = items.find((i) => i.id === selectedId) || null;

  return (
    <div className="h-full flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Inbox</h1>
          <p className="text-xs text-gray-600">
            All homeowner replies in one place, sorted by who&apos;s most likely to book.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 flex gap-2 text-[11px]">
        <FilterPill label="Active" value="active" current={filter} setFilter={setFilter} />
        <FilterPill label="All" value="all" current={filter} setFilter={setFilter} />
        <FilterPill label="Hot" value="hot_lead" current={filter} setFilter={setFilter} />
        <FilterPill label="Warm" value="warm_lead" current={filter} setFilter={setFilter} />
        <FilterPill label="Follow-up" value="follow_up" current={filter} setFilter={setFilter} />
      </div>

      <div className="flex flex-1 min-h-0 border rounded-2xl bg-white overflow-hidden">
        {/* Left: list */}
        <div className="w-1/3 border-r flex flex-col">
          {loading && <div className="text-[11px] p-3 text-gray-500">Loading…</div>}
          {!loading && items.length === 0 && (
            <div className="text-[11px] p-3 text-gray-500">
              No replies match this filter yet.
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`w-full text-left p-3 border-b text-[11px] hover:bg-slate-50 ${
                  selectedId === item.id ? "bg-slate-100" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold">
                    {item.contacts?.first_name || item.contacts?.last_name
                      ? `${item.contacts?.first_name || ""} ${
                          item.contacts?.last_name || ""
                        }`
                      : item.contacts?.email}
                  </div>
                  <IntentBadge intent={item.intent_label} />
                </div>
                <div className="text-gray-500 truncate">
                  {item.subject || "(no subject)"}
                </div>
                <div className="text-gray-400 line-clamp-2 mt-0.5">
                  {item.body.replace(/\s+/g, " ").slice(0, 140)}
                </div>
                {/* Block 16300: Owner display */}
                {item.contacts?.owner_user_id && (
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    Owner: {item.owner?.full_name || item.owner?.email || "Unknown"}
                  </div>
                )}
                <div className="text-gray-400 mt-0.5 flex justify-between">
                  <span>
                    {item.contacts?.city && `${item.contacts.city} · `}
                    Est: $
                    {Number(item.contacts?.est_job_value || 0).toLocaleString(
                      undefined,
                      { maximumFractionDigits: 0 }
                    )}
                  </span>
                  <span>
                    {new Date(item.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: details */}
        <div className="flex-1 flex flex-col">
          {selected ? (
            <MessageDetail item={selected} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-[11px] text-gray-500">
              Select a reply to see details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  label,
  value,
  current,
  setFilter,
}: {
  label: string;
  value: "active" | "all" | "hot_lead" | "warm_lead" | "follow_up";
  current: string;
  setFilter: (value: "active" | "all" | "hot_lead" | "warm_lead" | "follow_up") => void;
}) {
  const isActive = current === value;
  return (
    <button
      onClick={() => setFilter(value)}
      className={`px-3 py-1 rounded-full border ${
        isActive ? "bg-black text-white border-black" : "bg-white"
      }`}
    >
      {label}
    </button>
  );
}

function IntentBadge({ intent }: { intent: string | null }) {
  const map: Record<
    string,
    { label: string; className: string }
  > = {
    hot_lead: {
      label: "HOT",
      className: "bg-red-500 text-white",
    },
    warm_lead: {
      label: "WARM",
      className: "bg-orange-400 text-white",
    },
    follow_up: {
      label: "FOLLOW-UP",
      className: "bg-blue-500 text-white",
    },
    not_interested: {
      label: "NO",
      className: "bg-gray-300 text-gray-700",
    },
    unsubscribe: {
      label: "UNSUB",
      className: "bg-gray-500 text-white",
    },
    unknown: {
      label: "UNKNOWN",
      className: "bg-slate-200 text-slate-700",
    },
  };

  const config = map[intent || "unknown"] || map.unknown;

  return (
    <span
      className={`text-[9px] px-2 py-0.5 rounded-full uppercase ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function MessageDetail({ item }: { item: InboxItem }) {
  const contact = item.contacts;

  async function createTask() {
    const res = await fetch(`/api/inbox/${item.id}/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to create task");
      return;
    }
    alert("Follow-up task created.");
  }

  async function markHandled() {
    const res = await fetch(`/api/inbox/${item.id}/handled`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to mark handled");
      return;
    }
    // Refresh the list
    window.location.reload();
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b p-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold">
            {contact?.first_name || contact?.last_name
              ? `${contact?.first_name || ""} ${contact?.last_name || ""}`
              : contact?.email}
          </div>
          <div className="text-[11px] text-gray-500">
            {contact?.email}
            {contact?.city && ` · ${contact.city}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IntentBadge intent={item.intent_label} />
          {contact && (
            <Link
              href={`/contacts/${contact.id}`}
              className="text-[11px] px-3 py-1 rounded-full border"
            >
              View contact
            </Link>
          )}
        </div>
      </div>

      <div className="p-3 text-[11px] flex-1 overflow-y-auto">
        <div className="text-gray-500 mb-2">
          From campaign:{" "}
          {item.campaigns?.name || "Manual / unknown campaign"}
        </div>
        <div className="font-semibold mb-1">
          Subject: {item.subject || "(no subject)"}
        </div>
        <pre className="whitespace-pre-wrap text-[11px]">
          {item.body}
        </pre>
      </div>

      <div className="border-t p-3 flex items-center justify-between">
        <div className="text-[11px] text-gray-500">
          Est. value: $
          {Number(contact?.est_job_value || 0).toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })}
        </div>
        <div className="flex gap-2">
          <button
            onClick={createTask}
            className="text-[11px] px-3 py-1 rounded-full border"
          >
            Create follow-up task
          </button>
          <button
            onClick={markHandled}
            className="text-[11px] px-3 py-1 rounded-full bg-black text-white"
          >
            Mark handled
          </button>
        </div>
      </div>
    </div>
  );
}
