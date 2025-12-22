// Block 14000 — SmartSend Pipeline Board v1
// The Visual Kanban Board That Shows Roofers EXACTLY Where Every Lead Is

"use client";

import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import { LeadCard } from "./LeadCard";
import { PipelineInsights } from "./PipelineInsights";
import { LeadProfileDrawer } from "./LeadProfileDrawer";

type PipelineStage = "HOT" | "WARM" | "FOLLOW_UP" | "COLD" | "NOT_INTERESTED";

type Lead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  city: string | null;
  state: string | null;
  tags: string[] | null;
  pipeline_stage: PipelineStage;
  lead_score: number;
  lead_score_last_updated: string | null;
  last_message: {
    subject: string | null;
    snippet: string;
    received_at: string;
  } | null;
  estimated_value: number | null;
  last_reply_at: string | null;
  created_at: string;
  updated_at: string;
};

type PipelineData = {
  HOT: Lead[];
  WARM: Lead[];
  FOLLOW_UP: Lead[];
  COLD: Lead[];
  NOT_INTERESTED: Lead[];
};

type Insights = {
  stage_counts: Record<PipelineStage, number>;
  total_leads: number;
  average_lead_score: number;
  estimated_revenue: number;
  hot_leads: number;
  hot_conversion_rate: number;
};

const STAGE_CONFIG: Record<PipelineStage, { label: string; color: string; bgColor: string }> = {
  HOT: { label: "🔥 HOT", color: "text-red-600", bgColor: "bg-red-50 border-red-200" },
  WARM: { label: "🟨 WARM", color: "text-yellow-600", bgColor: "bg-yellow-50 border-yellow-200" },
  FOLLOW_UP: { label: "🟦 FOLLOW-UP", color: "text-blue-600", bgColor: "bg-blue-50 border-blue-200" },
  COLD: { label: "⬜ COLD", color: "text-gray-600", bgColor: "bg-gray-50 border-gray-200" },
  NOT_INTERESTED: { label: "🟫 NOT INTERESTED", color: "text-brown-600", bgColor: "bg-brown-50 border-brown-200" },
};

export function PipelineBoardV1() {
  const [pipeline, setPipeline] = useState<PipelineData>({
    HOT: [],
    WARM: [],
    FOLLOW_UP: [],
    COLD: [],
    NOT_INTERESTED: [],
  });
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    loadPipeline();
    loadInsights();
    
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      loadPipeline();
      loadInsights();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  async function loadPipeline() {
    try {
      const res = await fetch("/api/pipeline/board");
      if (!res.ok) throw new Error("Failed to load pipeline");
      const data = await res.json();
      setPipeline(data.pipeline || {
        HOT: [],
        WARM: [],
        FOLLOW_UP: [],
        COLD: [],
        NOT_INTERESTED: [],
      });
      setLoading(false);
    } catch (error) {
      console.error("Failed to load pipeline:", error);
      setLoading(false);
    }
  }

  async function loadInsights() {
    try {
      const res = await fetch("/api/pipeline/insights");
      if (!res.ok) throw new Error("Failed to load insights");
      const data = await res.json();
      setInsights(data);
    } catch (error) {
      console.error("Failed to load insights:", error);
    }
  }

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    
    const { source, destination, draggableId } = result;
    
    // Don't do anything if dropped in the same place
    if (source.droppableId === destination.droppableId) return;

    const sourceStage = source.droppableId as PipelineStage;
    const destStage = destination.droppableId as PipelineStage;

    // Find the lead being moved
    const lead = pipeline[sourceStage].find((l) => l.id === draggableId);
    if (!lead) return;

    // Optimistically update UI
    const updatedPipeline = { ...pipeline };
    updatedPipeline[sourceStage] = updatedPipeline[sourceStage].filter(
      (l) => l.id !== draggableId
    );
    updatedPipeline[destStage] = [
      ...updatedPipeline[destStage],
      { ...lead, pipeline_stage: destStage },
    ];
    setPipeline(updatedPipeline);

    // Update on server
    try {
      const res = await fetch("/api/pipeline/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: draggableId,
          to_stage: destStage,
          reason: "manual_drag",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to move lead");
      }

      // Reload to get fresh data
      await loadPipeline();
      await loadInsights();
    } catch (error) {
      console.error("Failed to move lead:", error);
      // Revert optimistic update
      await loadPipeline();
    }
  }

  function handleCardClick(lead: Lead) {
    setSelectedLead(lead);
    setDrawerOpen(true);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-5 gap-4">
          {Object.keys(STAGE_CONFIG).map((stage) => (
            <div key={stage} className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pipeline Insights */}
      {insights && <PipelineInsights insights={insights} />}

      {/* Pipeline Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {(Object.keys(STAGE_CONFIG) as PipelineStage[]).map((stage) => {
            const config = STAGE_CONFIG[stage];
            const leads = pipeline[stage] || [];

            return (
              <Droppable droppableId={stage} key={stage}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 min-w-[280px] rounded-lg border-2 p-4 ${
                      config.bgColor
                    } ${
                      snapshot.isDraggingOver ? "ring-2 ring-blue-400" : ""
                    } transition-all`}
                  >
                    {/* Column Header */}
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className={`font-bold text-lg ${config.color}`}>
                        {config.label}
                      </h3>
                      <Badge variant="secondary" className="ml-2">
                        {leads.length}
                      </Badge>
                    </div>

                    {/* Leads */}
                    <div className="space-y-2 min-h-[200px]">
                      {leads.map((lead, index) => (
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
                              className={`${
                                snapshot.isDragging ? "opacity-50" : ""
                              } cursor-grab active:cursor-grabbing`}
                              onClick={() => handleCardClick(lead)}
                            >
                              <LeadCard lead={lead} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      {/* Lead Profile Drawer */}
      {selectedLead && (
        <LeadProfileDrawer
          lead={selectedLead}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
        />
      )}
    </div>
  );
}

