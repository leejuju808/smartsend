"use client";

import { useState, useEffect, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { PipelineColumn, type Lead } from "./PipelineColumn";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Skeleton } from "@/components/ui/skeleton";

const COLUMNS = [
  { id: "new_lead", title: "New Leads" },
  { id: "contacted", title: "Contacted" },
  { id: "estimate_booked", title: "Estimate Booked" },
  { id: "estimate_completed", title: "Estimate Completed" },
  { id: "proposal_sent", title: "Proposal Sent" },
  { id: "decision_pending", title: "Decision Pending" },
  { id: "won", title: "Won" },
  { id: "lost", title: "Lost" },
];

export function RoofingPipelineBoard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  // Get workspace ID
  useEffect(() => {
    async function getWorkspaceId() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get user's first workspace
        const { data: workspaceData } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .limit(1)
          .single();

        if (workspaceData?.workspace_id) {
          setWorkspaceId(workspaceData.workspace_id);
        }
      } catch (error) {
        console.error("Error getting workspace ID:", error);
      }
    }

    getWorkspaceId();
  }, [supabase]);

  // Fetch pipeline data
  const fetchPipeline = useCallback(async () => {
    if (!workspaceId) return;

    try {
      setLoading(true);
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/get-pipeline?workspace_id=${workspaceId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch pipeline data");
      }

      const data = await response.json();
      if (data.leads) {
        setLeads(data.leads);
      }
    } catch (error) {
      console.error("Error fetching pipeline:", error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, supabase]);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  // Handle drag and drop
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;

    // Don't do anything if dropped in the same column
    if (source.droppableId === destination.droppableId) return;

    const newStatus = destination.droppableId;
    const leadId = draggableId;

    // Optimistically update UI
    const updatedLeads = leads.map((lead) =>
      lead.id === leadId ? { ...lead, status: newStatus } : lead
    );
    setLeads(updatedLeads);

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/update-lead-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            lead_id: leadId,
            new_status: newStatus,
          }),
        }
      );

      if (!response.ok) {
        // Revert on error
        setLeads(leads);
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update lead status");
      }

      // Refresh pipeline data to ensure consistency
      await fetchPipeline();
    } catch (error) {
      console.error("Error updating lead status:", error);
      // Revert optimistic update
      setLeads(leads);
      alert("Failed to update lead status. Please try again.");
    }
  };

  // Group leads by status
  const leadsByStatus = COLUMNS.reduce((acc, column) => {
    acc[column.id] = leads.filter((lead) => lead.status === column.id);
    return acc;
  }, {} as Record<string, Lead[]>);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
          {COLUMNS.map((col) => (
            <div key={col.id} className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">
          🧱 SmartSend Roofing Pipeline Board
        </h2>
        <p className="text-gray-400 text-sm">
          Drag and drop leads between columns to update their status
        </p>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((column) => (
            <PipelineColumn
              key={column.id}
              status={column.id}
              title={column.title}
              leads={leadsByStatus[column.id] || []}
            />
          ))}
        </div>
      </DragDropContext>

      {/* Summary Stats */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <div className="text-sm text-gray-400">Total Leads</div>
          <div className="text-2xl font-bold text-white">{leads.length}</div>
        </div>
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <div className="text-sm text-gray-400">Pipeline Value</div>
          <div className="text-2xl font-bold text-green-400">
            {new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }).format(
              leads
                .filter((l) => l.status !== 'won' && l.status !== 'lost')
                .reduce((sum, l) => sum + (l.estimated_job_value || 0), 0)
            )}
          </div>
        </div>
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <div className="text-sm text-gray-400">Won</div>
          <div className="text-2xl font-bold text-green-400">
            {leads.filter((l) => l.status === 'won').length}
          </div>
        </div>
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <div className="text-sm text-gray-400">Lost</div>
          <div className="text-2xl font-bold text-red-400">
            {leads.filter((l) => l.status === 'lost').length}
          </div>
        </div>
      </div>
    </div>
  );
}









































