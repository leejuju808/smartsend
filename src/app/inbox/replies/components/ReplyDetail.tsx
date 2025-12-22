"use client";

import { useState, useEffect } from "react";
import { useReplyThread } from "@/hooks/useReplyThread";
import type { ReplyIntent, ReplyStatus } from "@/types/reply-inbox";
import IntentBadge from "./IntentBadge";
import ThreadNotes from "./ThreadNotes";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// Using native Date formatting
import Link from "next/link";
import { X } from "lucide-react";
import { SnoozeButton } from "@/components/inbox/SnoozeButton";

interface ReplyDetailProps {
  threadId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export default function ReplyDetail({ threadId, onClose, onUpdate }: ReplyDetailProps) {
  const { data, loading, updateThread, createTask } = useReplyThread(threadId);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [workspaceMembers, setWorkspaceMembers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  if (loading || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const { thread, messages, intents, notes } = data;

  // Load workspace members and current user
  useEffect(() => {
    const loadData = async () => {
      try {
        // Get workspace members
        const membersRes = await fetch("/api/inbox/workspace-members");
        if (membersRes.ok) {
          const membersData = await membersRes.json();
          setWorkspaceMembers(membersData.members || []);
        }

        // Get current user
        const userRes = await fetch("/api/auth/user");
        if (userRes.ok) {
          const userData = await userRes.json();
          setCurrentUserId(userData.user?.id || null);
        }
      } catch (err) {
        console.error("Failed to load workspace data:", err);
      }
    };
    loadData();
  }, []);

  const handleIntentChange = async (newIntent: ReplyIntent) => {
    try {
      await updateThread({ latestIntent: newIntent });
      onUpdate();
    } catch (err) {
      console.error("Failed to update intent:", err);
    }
  };

  const handleStatusChange = async (newStatus: ReplyStatus) => {
    try {
      await updateThread({ status: newStatus });
      onUpdate();
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const handleAssignmentChange = async (userId: string | null) => {
    try {
      await updateThread({ assignedTo: userId });
      onUpdate();
    } catch (err) {
      console.error("Failed to update assignment:", err);
      alert(err instanceof Error ? err.message : "Failed to update assignment");
    }
  };

  const handleCreateTask = async () => {
    try {
      await createTask({
        title: taskTitle || `Follow up with ${thread.contactName || thread.contactEmail}`,
        dueDate: taskDueDate || undefined,
      });
      setShowTaskModal(false);
      setTaskTitle("");
      setTaskDueDate("");
      onUpdate();
    } catch (err) {
      console.error("Failed to create task:", err);
    }
  };

  const latestIntent = intents[0];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-lg font-semibold">
                {thread.contactName || thread.contactEmail || "Unknown Contact"}
              </h2>
              <IntentBadge intent={thread.latestIntent} />
            </div>
            <p className="text-sm text-muted-foreground">{thread.contactEmail}</p>
            {thread.campaignName && (
              <p className="text-sm text-muted-foreground">Campaign: {thread.campaignName}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Intent:</label>
            <Select
              value={thread.latestIntent}
              onValueChange={(value) => handleIntentChange(value as ReplyIntent)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hot">Hot</SelectItem>
                <SelectItem value="warm">Warm</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
                <SelectItem value="not_interested">Not Interested</SelectItem>
                <SelectItem value="unclassified">Unclassified</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Assigned to:</label>
            <Select
              value={thread.assignedTo || "unassigned"}
              onValueChange={(value) => {
                if (value === "unassigned") {
                  handleAssignmentChange(null);
                } else if (value === "me" && currentUserId) {
                  handleAssignmentChange(currentUserId);
                } else {
                  handleAssignmentChange(value);
                }
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {currentUserId && (
                  <SelectItem value="me">Assign to me</SelectItem>
                )}
                {workspaceMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name || member.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Status:</label>
            <Select
              value={thread.status}
              onValueChange={(value) => handleStatusChange(value as ReplyStatus)}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="snoozed">Snoozed</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTaskModal(true)}
          >
            Create Follow-Up Task
          </Button>

          {thread.contactId && (
            <Link href={`/contacts/${thread.contactId}`}>
              <Button variant="outline" size="sm">
                View Contact Profile
              </Button>
            </Link>
          )}

          <SnoozeButton
            threadId={threadId}
            snoozedUntil={thread.snoozedUntil}
            onSnoozed={onUpdate}
            onUnsnooze={onUpdate}
            variant="outline"
            size="sm"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatusChange("archived")}
          >
            Archive
          </Button>
        </div>

        {/* AI Insight */}
        {latestIntent && (
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <div className="text-sm font-medium mb-1">AI Intent</div>
            <div className="text-sm text-muted-foreground">
              {latestIntent.intent.toUpperCase()} — {latestIntent.confidence ? `confidence: ${(latestIntent.confidence * 100).toFixed(0)}%` : ""}
            </div>
          </div>
        )}
      </div>

      {/* Messages and Notes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Messages */}
        <div className="space-y-4">
          {messages.map((message, idx) => (
            <div
              key={message.id}
              className={`p-4 rounded-lg border ${
                message.direction === "inbound" ? "bg-muted/50" : "bg-background"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">
                  {message.direction === "inbound" ? "← Received" : "→ Sent"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(message.sentAt).toLocaleString()}
                </div>
              </div>
              <div className="text-sm text-muted-foreground mb-2">
                From: {message.from} → To: {message.to}
              </div>
              {idx === 0 && message.subject && (
                <div className="text-sm font-medium mb-2">Subject: {message.subject}</div>
              )}
              <div className="text-sm whitespace-pre-wrap">{message.body || message.snippet}</div>
            </div>
          ))}
        </div>

        {/* Internal Notes */}
        <div className="mt-6 border-t pt-4">
          <ThreadNotes threadId={threadId} notes={notes || []} onUpdate={onUpdate} />
        </div>
      </div>

      {/* Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Create Follow-Up Task</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Title</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={`Call about ${thread.subject || "reply"}`}
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Due Date</label>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowTaskModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateTask}>Create Task</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

