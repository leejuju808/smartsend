// Block 24260 — SmartSend Roofing Pipeline Board v1
// Visual Kanban Board for Roofing Job Pipeline
// Shows: Lead In → Inspection Set → Quote Sent → Approved → Scheduled → Installed

"use client";

import { useState } from "react";
import useSWR from "swr";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { RoofingLeadCard } from "./RoofingLeadCard";
import { RoofingPipelineMetrics } from "./RoofingPipelineMetrics";
import { RoofingLeadDetailDrawer } from "./RoofingLeadDetailDrawer";
import clsx from "clsx";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const ROOFING_STAGES = [
  { key: "lead_in", label: "Lead In", color: "border-gray-500", bgColor: "bg-gray-50/5" },
  { key: "inspection_set", label: "Inspection Set", color: "border-blue-500", bgColor: "bg-blue-50/5" },
  { key: "quote_sent", label: "Quote Sent", color: "border-amber-500", bgColor: "bg-amber-50/5" },
  { key: "approved", label: "Approved", color: "border-green-500", bgColor: "bg-green-50/5" },
  { key: "scheduled", label: "Scheduled", color: "border-purple-500", bgColor: "bg-purple-50/5" },
  { key: "installed", label: "Installed", color: "border-emerald-500", bgColor: "bg-emerald-50/5" },
] as const;

export type RoofingLead = {
  id: string;
  homeowner_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  pipeline_stage: string;
  estimated_value: number;
  job_type: string | null;
  payment_type: string | null;
  close_probability: number;
  lead_status: "HOT" | "WARM" | "COLD";
  tags: string[];
  stage_entered_at: string | null;
  last_reply_at: string | null;
  last_contact_at: string | null;
  days_in_stage: number;
  days_since_last_contact: number | null;
  created_at: string;
  updated_at: string;
};

type PipelineBoardData = {
  columns: Array<{
    key: string;
    label: string;
    position: number;
    total: number;
    hot_count: number;
    potential_revenue: number;
    avg_probability: number;
  }>;
  jobs_by_stage: Record<string, RoofingLead[]>;
  total_jobs: number;
};

export function RoofingPipelineBoard() {
  const { data, error, isLoading, mutate } = useSWR<PipelineBoardData>(
    "/api/pipeline/roofing/board",
    fetcher,
    {
      refreshInterval: 30000, // Refresh every 30 seconds
    }
  );

  const [selectedLead, setSelectedLead] = useState<RoofingLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // If dropped outside a droppable area, do nothing
    if (!destination) {
      return;
    }

    // If dropped in the same position, do nothing
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    // Get the new stage from destination
    const newStage = destination.droppableId;

    // Optimistically update UI
    setIsMoving(true);

    try {
      // Call API to move the lead
      const response = await fetch("/api/pipeline/roofing/move", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lead_id: draggableId,
          new_stage: newStage,
          trigger_reason: "drag_and_drop",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to move lead");
      }

      // Refresh data
      mutate();
    } catch (error) {
      console.error("Error moving lead:", error);
      // TODO: Show error toast
    } finally {
      setIsMoving(false);
    }
  };

  const handleCardClick = (lead: RoofingLead) => {
    setSelectedLead(lead);
    setDrawerOpen(true);
  };

  const handleStageUpdate = () => {
    mutate(); // Refresh data after update
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
        <div className="text-sm text-zinc-400">Loading roofing pipeline...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
        <div className="text-sm text-red-400">Failed to load pipeline</div>
      </div>
    );
  }

  const jobsByStage = data?.jobs_by_stage || {};
  const columns = data?.columns || [];

  return (
    <>
      {/* Pipeline Metrics Dashboard */}
      <RoofingPipelineMetrics />

      {/* Pipeline Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 mt-6">
          {ROOFING_STAGES.map((stage) => {
            const stageLeads = jobsByStage[stage.key] || [];
            const columnStats = columns.find((c) => c.key === stage.key);

            return (
              <Droppable key={stage.key} droppableId={stage.key}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={clsx(
                      "rounded-2xl border p-4 flex flex-col gap-3 min-h-[500px] transition-colors",
                      stage.color,
                      snapshot.isDraggingOver && "ring-2 ring-offset-2 ring-blue-500",
                      stage.bgColor
                    )}
                  >
                    {/* Column Header */}
                    <div className="flex flex-col gap-1">
                      <h2 className="text-sm font-semibold flex items-center justify-between">
                        <span>{stage.label}</span>
                        <span className="text-xs text-zinc-500 font-normal">
                          {stageLeads.length}
                        </span>
                      </h2>
                      {columnStats && (
                        <div className="text-xs text-zinc-500 space-y-0.5">
                          {columnStats.hot_count > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-red-500"></span>
                              <span>{columnStats.hot_count} HOT</span>
                            </div>
                          )}
                          {columnStats.potential_revenue > 0 && (
                            <div>
                              ${(columnStats.potential_revenue / 1000).toFixed(1)}k
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Leads List */}
                    <div className="space-y-3 flex-1 overflow-y-auto pr-1 max-h-[calc(100vh-300px)]">
                      {stageLeads.length === 0 ? (
                        <p className="text-xs text-zinc-500 text-center py-8">
                          No leads in this stage yet.
                        </p>
                      ) : (
                        stageLeads.map((lead, index) => (
                          <Draggable
                            key={lead.id}
                            draggableId={lead.id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={clsx(
                                  snapshot.isDragging && "opacity-50"
                                )}
                              >
                                <RoofingLeadCard
                                  lead={lead}
                                  onClick={() => handleCardClick(lead)}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))
                      )}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      {/* Lead Detail Drawer */}
      {selectedLead && (
        <RoofingLeadDetailDrawer
          lead={selectedLead}
          open={drawerOpen}
          onClose={() => {
            setDrawerOpen(false);
            setSelectedLead(null);
          }}
          onUpdate={handleStageUpdate}
        />
      )}
    </>
  );
}






































