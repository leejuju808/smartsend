"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@supabase/supabase-js";
import { CheckCircle2, XCircle, Clock, CheckSquare, Square, Filter } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ApprovalItem = {
  id: string;
  workspace_id: string;
  campaign_id: string;
  lead_id: string;
  email_subject: string;
  email_body: string;
  scheduled_at: string;
  status: "pending" | "approved" | "rejected";
  submitted_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  inline_comments: string | null;
  created_at: string;
  lead: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
  campaign: {
    id: string;
    name: string | null;
    title: string | null;
  } | null;
  submitted_by_profile: {
    id: string;
    email: string | null;
    full_name: string | null;
  } | null;
  reviewed_by_profile: {
    id: string;
    email: string | null;
    full_name: string | null;
  } | null;
};

export default function ApprovalQueuePage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectionReason, setRejectionReason] = useState("");
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [isOwnerOrAdmin, setIsOwnerOrAdmin] = useState(false);

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (workspaceId) {
      void loadItems();
    }
  }, [workspaceId, statusFilter]);

  async function initialize() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setInitialLoading(false);
        return;
      }

      // Get user's workspace (simplified - adjust based on your workspace selection logic)
      const { data: workspace } = await supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (workspace) {
        setWorkspaceId(workspace.workspace_id);
        setIsOwnerOrAdmin(["owner", "admin"].includes(workspace.role));
      }
    } catch (error) {
      console.error("Error initializing:", error);
    } finally {
      setInitialLoading(false);
    }
  }

  async function loadItems() {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/approval-queue?workspace_id=${workspaceId}&status=${statusFilter}&limit=100`
      );
      const data = await response.json();
      setItems(data.items || []);
    } catch (error) {
      console.error("Error loading items:", error);
    } finally {
      setLoading(false);
    }
  }

  async function approveItem(id: string) {
    if (!isOwnerOrAdmin) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/approval-queue/${id}/approve`, {
        method: "POST"
      });
      const data = await response.json();
      if (data.ok) {
        await loadItems();
        setSelectedIds(new Set());
      } else {
        alert(data.error || "Failed to approve");
      }
    } catch (error) {
      console.error("Error approving:", error);
      alert("Failed to approve email");
    } finally {
      setLoading(false);
    }
  }

  async function rejectItem(id: string, reason: string) {
    if (!isOwnerOrAdmin) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/approval-queue/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejection_reason: reason })
      });
      const data = await response.json();
      if (data.ok) {
        await loadItems();
        setSelectedIds(new Set());
      } else {
        alert(data.error || "Failed to reject");
      }
    } catch (error) {
      console.error("Error rejecting:", error);
      alert("Failed to reject email");
    } finally {
      setLoading(false);
    }
  }

  async function bulkApprove() {
    if (!isOwnerOrAdmin || selectedIds.size === 0) return;
    setLoading(true);
    try {
      const response = await fetch("/api/approval-queue/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval_ids: Array.from(selectedIds) })
      });
      const data = await response.json();
      if (data.ok) {
        await loadItems();
        setSelectedIds(new Set());
        alert(`Successfully approved ${data.approved} email(s)`);
      } else {
        alert(data.error || "Failed to bulk approve");
      }
    } catch (error) {
      console.error("Error bulk approving:", error);
      alert("Failed to bulk approve");
    } finally {
      setLoading(false);
    }
  }

  async function bulkReject() {
    if (!isOwnerOrAdmin || selectedIds.size === 0 || !rejectionReason.trim()) return;
    setLoading(true);
    try {
      const response = await fetch("/api/approval-queue/bulk-reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          approval_ids: Array.from(selectedIds),
          rejection_reason: rejectionReason.trim()
        })
      });
      const data = await response.json();
      if (data.ok) {
        await loadItems();
        setSelectedIds(new Set());
        setRejectionReason("");
        setBulkRejectOpen(false);
        alert(`Successfully rejected ${data.rejected} email(s)`);
      } else {
        alert(data.error || "Failed to bulk reject");
      }
    } catch (error) {
      console.error("Error bulk rejecting:", error);
      alert("Failed to bulk reject");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: string) {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  }

  function toggleSelectAll() {
    const pendingItems = items.filter(item => item.status === "pending");
    if (selectedIds.size === pendingItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingItems.map(item => item.id)));
    }
  }

  if (initialLoading) {
    return (
      <div className="p-6">
        <p>Loading...</p>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Approval Queue</h1>
        <p className="text-gray-600">You need to be part of a workspace to view the approval queue.</p>
      </div>
    );
  }

  const pendingItems = items.filter(item => item.status === "pending");
  const hasSelection = selectedIds.size > 0;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Review & Approval Queue</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review and approve emails before they are sent
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {statusFilter === "pending" && isOwnerOrAdmin && hasSelection && (
        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button onClick={bulkApprove} disabled={loading} variant="default">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Bulk Approve
          </Button>
          <Button 
            onClick={() => setBulkRejectOpen(true)} 
            disabled={loading} 
            variant="destructive"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Bulk Reject
          </Button>
        </div>
      )}

      {bulkRejectOpen && (
        <div className="p-4 bg-gray-50 rounded-lg border space-y-3">
          <h3 className="font-medium">Bulk Reject Reason</h3>
          <Input
            placeholder="Enter rejection reason..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={bulkReject} disabled={loading || !rejectionReason.trim()}>
              Confirm Reject
            </Button>
            <Button variant="secondary" onClick={() => {
              setBulkRejectOpen(false);
              setRejectionReason("");
            }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="p-6 text-center text-gray-500">Loading...</div>
      ) : items.length === 0 ? (
        <div className="p-6 text-center text-gray-500">
          No {statusFilter} emails in the approval queue.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="border rounded-lg p-4 space-y-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  {statusFilter === "pending" && isOwnerOrAdmin && (
                    <button
                      onClick={() => toggleSelect(item.id)}
                      className="mt-1"
                    >
                      {selectedIds.has(item.id) ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{item.email_subject}</h3>
                      <span className={`px-2 py-1 text-xs rounded ${
                        item.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                        item.status === "approved" ? "bg-green-100 text-green-800" :
                        "bg-red-100 text-red-800"
                      }`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>
                        <strong>Lead:</strong> {item.lead?.email || "Unknown"} 
                        {item.lead?.first_name && ` (${item.lead.first_name} ${item.lead.last_name || ""})`}
                      </div>
                      <div>
                        <strong>Campaign:</strong> {item.campaign?.name || item.campaign?.title || "Unknown"}
                      </div>
                      <div>
                        <strong>Scheduled:</strong> {new Date(item.scheduled_at).toLocaleString()}
                      </div>
                      {item.submitted_by_profile && (
                        <div>
                          <strong>Submitted by:</strong> {item.submitted_by_profile.full_name || item.submitted_by_profile.email || "Unknown"}
                        </div>
                      )}
                      {item.reviewed_by_profile && (
                        <div>
                          <strong>Reviewed by:</strong> {item.reviewed_by_profile.full_name || item.reviewed_by_profile.email || "Unknown"} 
                          {item.reviewed_at && ` at ${new Date(item.reviewed_at).toLocaleString()}`}
                        </div>
                      )}
                      {item.rejection_reason && (
                        <div className="text-red-600">
                          <strong>Rejection reason:</strong> {item.rejection_reason}
                        </div>
                      )}
                    </div>
                    <div className="mt-3 p-3 bg-gray-50 rounded text-sm max-h-40 overflow-y-auto">
                      <div dangerouslySetInnerHTML={{ __html: item.email_body }} />
                    </div>
                  </div>
                </div>
                {statusFilter === "pending" && isOwnerOrAdmin && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => approveItem(item.id)}
                      disabled={loading}
                      variant="default"
                      size="sm"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      onClick={() => {
                        const reason = prompt("Enter rejection reason:");
                        if (reason) {
                          rejectItem(item.id, reason);
                        }
                      }}
                      disabled={loading}
                      variant="destructive"
                      size="sm"
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}



