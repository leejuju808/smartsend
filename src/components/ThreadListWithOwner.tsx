"use client";

import { useState, useEffect } from "react";
import { OwnerCell } from "./OwnerCell";
import { Button } from "@/components/ui/Button";

type Thread = {
  id: string;
  workspace_id: string;
  lead_email: string;
  subject: string | null;
  last_message_at: string;
  owner_id: string | null;
  last_intent: string | null;
};

type Filter = "all" | "my" | "unassigned";

interface ThreadListWithOwnerProps {
  workspaceId: string;
  currentUserId: string;
  canAssign?: boolean;
}

export function ThreadListWithOwner({ workspaceId, currentUserId, canAssign = false }: ThreadListWithOwnerProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    loadThreads();
  }, [workspaceId, filter]);

  const loadThreads = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ workspaceId });
      if (filter === "my") params.set("ownerId", currentUserId);
      if (filter === "unassigned") params.set("unassigned", "true");

      const res = await fetch(`/api/inbox/threads?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads || []);
      }
    } catch (error) {
      console.error("Error loading threads:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOwnerChange = async (threadId: string, ownerId: string | null) => {
    try {
      const res = await fetch("/api/threads/assign-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId, owner_id: ownerId }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to assign owner");
        return;
      }

      // Update local state
      setThreads(prev =>
        prev.map(t => (t.id === threadId ? { ...t, owner_id: ownerId } : t))
      );
    } catch (error) {
      console.error("Error assigning owner:", error);
      alert("Failed to assign owner");
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          All
        </Button>
        <Button
          variant={filter === "my" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("my")}
        >
          My Threads
        </Button>
        <Button
          variant={filter === "unassigned" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("unassigned")}
        >
          Unassigned
        </Button>
      </div>

      {/* Thread List */}
      {loading ? (
        <div className="text-sm text-gray-500">Loading threads...</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left">From</th>
                <th className="px-4 py-2 text-left">Subject</th>
                <th className="px-4 py-2 text-left">Intent</th>
                <th className="px-4 py-2 text-left">Owner</th>
                <th className="px-4 py-2 text-left">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {threads.map(thread => (
                <tr key={thread.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2">{thread.lead_email}</td>
                  <td className="px-4 py-2">{thread.subject || "(no subject)"}</td>
                  <td className="px-4 py-2">
                    {thread.last_intent && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                        {thread.last_intent}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <OwnerCell
                      value={thread.owner_id}
                      onChange={(userId) => handleOwnerChange(thread.id, userId)}
                      workspaceId={workspaceId}
                      canEdit={canAssign}
                    />
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {new Date(thread.last_message_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {threads.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No threads found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

