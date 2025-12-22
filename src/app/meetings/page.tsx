// /app/meetings/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Meeting = {
  id: string;
  contact_email: string;
  sender_email?: string;
  subject: string | null;
  reply_snippet: string | null;
  calendly_link?: string;
  status: "pending" | "sent" | "accepted" | "declined" | "booked" | "proposed" | "no_meeting" | "cancelled";
  created_at: string;
};

const StatusBadge = ({ s }: { s: Meeting["status"] }) => {
  const styles: Record<Meeting["status"], string> = {
    pending:
      "bg-yellow-100 text-yellow-800 border border-yellow-200 px-2 py-0.5 rounded-full text-xs",
    sent: "bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full text-xs",
    accepted:
      "bg-green-100 text-green-800 border border-green-200 px-2 py-0.5 rounded-full text-xs",
    declined:
      "bg-red-100 text-red-800 border border-red-200 px-2 py-0.5 rounded-full text-xs",
    booked:
      "bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full text-xs font-medium",
    proposed:
      "bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-full text-xs",
    no_meeting:
      "bg-gray-100 text-gray-700 border border-gray-200 px-2 py-0.5 rounded-full text-xs",
    cancelled:
      "bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full text-xs",
  };
  
  const labels: Record<Meeting["status"], string> = {
    pending: "Pending",
    sent: "Sent",
    accepted: "Accepted",
    declined: "Declined",
    booked: "🎉 Booked",
    proposed: "Proposed",
    no_meeting: "No Meeting",
    cancelled: "Cancelled",
  };
  
  return <span className={styles[s]}>{labels[s]}</span>;
};

export default function MeetingsPage() {
  const [rows, setRows] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [count, setCount] = useState(0);

  const fetchMeetings = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    params.set("limit", "100");
    const res = await fetch(`/api/meetings?${params.toString()}`);
    const json = await res.json();
    setRows(json.data || []);
    setCount(json.count || 0);
    setLoading(false);
  };

  useEffect(() => {
    fetchMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFilter = async () => {
    await fetchMeetings();
  };

  const grouped = useMemo(() => {
    // group by day (local)
    const by: Record<string, Meeting[]> = {};
    rows.forEach((r) => {
      const d = new Date(r.created_at);
      const key = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
      by[key] = by[key] || [];
      by[key].push(r);
    });
    return by;
  }, [rows]);

  const updateStatus = async (id: string, newStatus: Meeting["status"]) => {
    const res = await fetch("/api/meetings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });
    if (res.ok) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Meetings</h1>
        <div className="text-sm text-muted-foreground">
          Total: <span className="font-medium">{count}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="px-3 py-2 border rounded-xl bg-background"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="booked">🎉 Booked</option>
          <option value="proposed">Proposed</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="declined">Declined</option>
          <option value="no_meeting">No Meeting</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input
          className="px-3 py-2 border rounded-xl flex-1 min-w-[220px]"
          placeholder="Search email or subject…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          onClick={onFilter}
          className="px-4 py-2 rounded-xl bg-black text-white hover:opacity-90"
        >
          Apply
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-3">When</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Subject / Snippet</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-4" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="p-6 text-muted-foreground" colSpan={5}>
                  No meetings yet.
                </td>
              </tr>
            ) : (
              Object.entries(grouped).map(([day, items]) => (
                <>
                  <tr key={`h-${day}`} className="bg-muted/20">
                    <td className="p-2 font-medium" colSpan={5}>
                      {day}
                    </td>
                  </tr>
                  {items.map((m) => (
                    <tr key={m.id} className="border-t">
                      <td className="p-3">
                        {new Date(m.created_at).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="p-3">
                        <div>{m.contact_email || m.sender_email || "—"}</div>
                        {m.calendly_link && (
                          <a 
                            href={m.calendly_link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline"
                          >
                            View Calendly
                          </a>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{m.subject || "—"}</div>
                        <div className="text-muted-foreground line-clamp-1 max-w-[520px]">
                          {m.reply_snippet || "—"}
                        </div>
                      </td>
                      <td className="p-3">
                        <StatusBadge s={m.status} />
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <button
                            className="text-xs px-2 py-1 border rounded-lg hover:bg-muted"
                            onClick={() => updateStatus(m.id, "accepted")}
                          >
                            Mark Accepted
                          </button>
                          <button
                            className="text-xs px-2 py-1 border rounded-lg hover:bg-muted"
                            onClick={() => updateStatus(m.id, "declined")}
                          >
                            Mark Declined
                          </button>
                          <button
                            className="text-xs px-2 py-1 border rounded-lg hover:bg-muted"
                            onClick={() => updateStatus(m.id, "sent")}
                          >
                            Mark Sent
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
