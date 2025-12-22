"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase";

type Thread = {
  id: string;
  lead_id: string;
  campaign_id: string;
  last_message_from: "lead" | "me" | null;
  last_message_at: string;
  status: "idle" | "awaiting_reply" | "followup_scheduled" | "closed_won" | "closed_lost";
  next_action_at: string | null;
  created_at: string;
  leads: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
  campaigns: {
    id: string;
    name: string | null;
    title: string | null;
    subject: string | null;
  } | null;
};

type Event = {
  id: string;
  thread_id: string;
  event_type: "send_followup" | "reply_interest" | "revive_lead" | "close_won" | "close_lost";
  details: Record<string, any>;
  created_at: string;
};

const statusColors: Record<Thread["status"], string> = {
  idle: "bg-gray-100 text-gray-800",
  awaiting_reply: "bg-blue-100 text-blue-800",
  followup_scheduled: "bg-yellow-100 text-yellow-800",
  closed_won: "bg-green-100 text-green-800",
  closed_lost: "bg-red-100 text-red-800",
};

const statusLabels: Record<Thread["status"], string> = {
  idle: "Idle",
  awaiting_reply: "Awaiting Reply",
  followup_scheduled: "Follow-up Scheduled",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
};

export default function AISDRDashboard() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Thread["status"] | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchThreads();
  }, [filter]);

  async function fetchThreads() {
    try {
      setLoading(true);
      let query = supabase
        .from("ai_sdr_threads")
        .select(
          `
          *,
          leads (
            id,
            email,
            first_name,
            last_name,
            company
          ),
          campaigns (
            id,
            name,
            title,
            subject
          )
        `
        )
        .order("last_message_at", { ascending: false })
        .limit(100);

      if (filter !== "all") {
        query = query.eq("status", filter);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching threads:", error);
      } else {
        setThreads((data as Thread[]) || []);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAutopilot(threadId: string, currentStatus: Thread["status"]) {
    // For now, we'll just update the status
    // In a full implementation, you'd want to pause/resume autopilot per thread
    const newStatus = currentStatus === "closed_won" || currentStatus === "closed_lost" 
      ? "idle" 
      : "closed_lost";

    const { error } = await supabase
      .from("ai_sdr_threads")
      .update({ status: newStatus })
      .eq("id", threadId);

    if (!error) {
      fetchThreads();
    }
  }

  const filteredThreads = threads.filter((thread) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const leadEmail = thread.leads?.email?.toLowerCase() || "";
      const leadName = `${thread.leads?.first_name || ""} ${thread.leads?.last_name || ""}`.toLowerCase();
      const campaignName = (thread.campaigns?.name || thread.campaigns?.title || "").toLowerCase();
      return leadEmail.includes(query) || leadName.includes(query) || campaignName.includes(query);
    }
    return true;
  });

  const statusCounts = {
    all: threads.length,
    idle: threads.filter((t) => t.status === "idle").length,
    awaiting_reply: threads.filter((t) => t.status === "awaiting_reply").length,
    followup_scheduled: threads.filter((t) => t.status === "followup_scheduled").length,
    closed_won: threads.filter((t) => t.status === "closed_won").length,
    closed_lost: threads.filter((t) => t.status === "closed_lost").length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI SDR Autopilot</h1>
          <p className="text-gray-600 mt-1">Manage autonomous sales conversations</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-600">Total Threads</div>
          <div className="text-2xl font-bold mt-1">{statusCounts.all}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-600">Idle</div>
          <div className="text-2xl font-bold mt-1">{statusCounts.idle}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-600">Awaiting Reply</div>
          <div className="text-2xl font-bold mt-1">{statusCounts.awaiting_reply}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-600">Follow-up Scheduled</div>
          <div className="text-2xl font-bold mt-1">{statusCounts.followup_scheduled}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-600">Closed Won</div>
          <div className="text-2xl font-bold mt-1 text-green-600">{statusCounts.closed_won}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-600">Closed Lost</div>
          <div className="text-2xl font-bold mt-1 text-red-600">{statusCounts.closed_lost}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex gap-2">
          {(["all", "idle", "awaiting_reply", "followup_scheduled", "closed_won", "closed_lost"] as const).map(
            (status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg border ${
                  filter === status
                    ? "bg-black text-white border-black"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {status === "all" ? "All" : statusLabels[status]} ({statusCounts[status]})
              </button>
            )
          )}
        </div>
        <input
          type="text"
          placeholder="Search by lead email, name, or campaign..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 max-w-md border rounded-lg px-4 py-2"
        />
      </div>

      {/* Threads Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading threads...</div>
      ) : filteredThreads.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No threads found. Enable AI SDR on a campaign to get started.
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lead
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Campaign
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Message
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Next Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredThreads.map((thread) => {
                const leadName =
                  thread.leads?.first_name || thread.leads?.last_name
                    ? `${thread.leads.first_name || ""} ${thread.leads.last_name || ""}`.trim()
                    : thread.leads?.email || "Unknown";
                const campaignName = thread.campaigns?.name || thread.campaigns?.title || "Unknown Campaign";
                const lastMessageDate = new Date(thread.last_message_at);
                const nextActionDate = thread.next_action_at ? new Date(thread.next_action_at) : null;

                return (
                  <tr key={thread.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{leadName}</div>
                      <div className="text-sm text-gray-500">{thread.leads?.email}</div>
                      {thread.leads?.company && (
                        <div className="text-xs text-gray-400">{thread.leads.company}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{campaignName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          statusColors[thread.status]
                        }`}
                      >
                        {statusLabels[thread.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {thread.last_message_from === "lead" ? "📥 Lead" : "📤 Me"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {lastMessageDate.toLocaleDateString()} {lastMessageDate.toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {nextActionDate ? (
                        <>
                          <div className="text-sm text-gray-900">
                            {nextActionDate.toLocaleDateString()} {nextActionDate.toLocaleTimeString()}
                          </div>
                          <div className="text-xs text-gray-500">
                            {nextActionDate < new Date() ? "Overdue" : "Scheduled"}
                          </div>
                        </>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push(`/dashboard/ai-sdr/${thread.id}`)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          View
                        </button>
                        <button
                          onClick={() => toggleAutopilot(thread.id, thread.status)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {thread.status === "closed_won" || thread.status === "closed_lost"
                            ? "Resume"
                            : "Pause"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


