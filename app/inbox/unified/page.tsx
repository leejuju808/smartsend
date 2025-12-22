// Block 150000 — Unified Messaging Inbox
// All channels in one place: Email, SMS, Widget, Calls

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type InboxItem = {
  id: string;
  company_id: string;
  lead_id: string;
  channel: "email" | "sms" | "widget" | "call" | "system";
  direction: "incoming" | "outgoing";
  sender: string | null;
  body: string;
  subject: string | null;
  created_at: string;
  read_by_users: string[] | null;
  unread_count: number;
  lead_name: string | null;
  lead_email: string | null;
  lead_phone: string | null;
  lead_address: string | null;
  heat_score: number | null;
  lead_status: string | null;
};

export default function UnifiedInboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "hot">("all");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function loadCompanyId() {
      // Get company_id from user's session
      // For now, we'll try to get it from the first roofing company
      try {
        const res = await fetch("/api/me");
        const data = await res.json();
        if (data.user_id) {
          // Get user's first roofing company
          const companyRes = await fetch(
            `/api/roofing-companies?user_id=${data.user_id}`
          );
          const companyData = await companyRes.json();
          if (companyData.companies?.[0]?.id) {
            setCompanyId(companyData.companies[0].id);
          }
        }
      } catch (error) {
        console.error("Error loading company ID:", error);
      }
    }
    loadCompanyId();
  }, []);

  useEffect(() => {
    if (!companyId) return;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/inbox/unified?company_id=${companyId}&filter=${filter}`
        );
        const json = await res.json();
        setItems(json.items || []);
        if (!selectedLeadId && json.items?.[0]?.lead_id) {
          setSelectedLeadId(json.items[0].lead_id);
        }
      } catch (error) {
        console.error("Error loading inbox:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [companyId, filter, selectedLeadId]);

  const selectedItem = items.find((i) => i.lead_id === selectedLeadId) || null;

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "email":
        return "📧";
      case "sms":
        return "💬";
      case "widget":
        return "💭";
      case "call":
        return "📞";
      case "system":
        return "⚙️";
      default:
        return "📨";
    }
  };

  const getChannelColor = (channel: string) => {
    switch (channel) {
      case "email":
        return "bg-blue-100 text-blue-700";
      case "sms":
        return "bg-green-100 text-green-700";
      case "widget":
        return "bg-purple-100 text-purple-700";
      case "call":
        return "bg-orange-100 text-orange-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!companyId) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Loading company information...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Unified Inbox</h1>
          <p className="text-xs text-gray-600">
            All messages in one place — email, SMS, widget, calls, everything.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 flex gap-2 text-[11px]">
        <FilterPill
          label="All"
          value="all"
          current={filter}
          setFilter={setFilter}
        />
        <FilterPill
          label="Unread"
          value="unread"
          current={filter}
          setFilter={setFilter}
        />
        <FilterPill
          label="Hot Leads"
          value="hot"
          current={filter}
          setFilter={setFilter}
        />
      </div>

      <div className="flex flex-1 min-h-0 border rounded-2xl bg-white overflow-hidden">
        {/* Left: list */}
        <div className="w-1/3 border-r flex flex-col">
          {loading && (
            <div className="text-[11px] p-3 text-gray-500">Loading…</div>
          )}
          {!loading && items.length === 0 && (
            <div className="text-[11px] p-3 text-gray-500">
              No messages match this filter yet.
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {items.map((item) => (
              <button
                key={item.lead_id}
                onClick={() => {
                  setSelectedLeadId(item.lead_id);
                  router.push(`/inbox/unified/${item.lead_id}`);
                }}
                className={`w-full text-left p-3 border-b text-[11px] hover:bg-slate-50 ${
                  selectedLeadId === item.lead_id ? "bg-slate-100" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="font-semibold flex items-center gap-2">
                    {item.lead_name || item.lead_email || "Unknown"}
                    {item.unread_count > 0 && (
                      <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">
                        {item.unread_count}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded ${getChannelColor(
                      item.channel
                    )}`}
                  >
                    {getChannelIcon(item.channel)}
                  </span>
                </div>
                <div className="text-gray-500 truncate mb-1">
                  {item.subject || item.body.replace(/\s+/g, " ").slice(0, 60)}
                </div>
                <div className="text-gray-400 flex justify-between items-center">
                  <span>
                    {item.heat_score !== null && (
                      <span
                        className={
                          item.heat_score >= 70
                            ? "text-red-600 font-semibold"
                            : item.heat_score >= 50
                            ? "text-orange-600"
                            : "text-gray-500"
                        }
                      >
                        Heat: {item.heat_score}
                      </span>
                    )}
                  </span>
                  <span>{formatTime(item.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: details */}
        <div className="flex-1 flex flex-col">
          {selectedItem ? (
            <div className="flex-1 flex items-center justify-center text-[11px] text-gray-500">
              <Link
                href={`/inbox/unified/${selectedItem.lead_id}`}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
              >
                View Conversation Thread →
              </Link>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[11px] text-gray-500">
              Select a conversation to view messages.
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
  value: "all" | "unread" | "hot";
  current: string;
  setFilter: (value: "all" | "unread" | "hot") => void;
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


























