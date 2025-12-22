"use client";

// Block 73000 — SmartSend Roofing Estimate Fast-Track Pipeline Board
// Kanban board showing leads in roofing pipeline stages

import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  Clock, 
  DollarSign, 
  AlertCircle,
  Plus,
  Mail,
  Calendar
} from "lucide-react";
import { EstimateRequestModal } from "./EstimateRequestModal";
import { EstimateUploadModal } from "./EstimateUploadModal";
import { LeadDetailDrawer } from "./LeadDetailDrawer";
import { toast } from "sonner";

interface Lead {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  intent_classification: "Hot" | "Warm" | "Not Interested" | null;
  stage_name: string;
  stage_id: string | null;
  estimate_request: any | null;
  estimates: any[];
  latest_estimate: any | null;
  pending_followups: any[];
  has_pending_followup: boolean;
  created_at: string;
  updated_at: string;
}

interface PipelineData {
  pipeline: Record<string, Lead[]>;
  stages: Array<{ id: string; name: string; order_index: number }>;
  total_leads: number;
}

const STAGE_COLORS: Record<string, string> = {
  "New Lead": "bg-gray-100 border-gray-300",
  "Replied": "bg-blue-50 border-blue-300",
  "Estimate Needed": "bg-yellow-50 border-yellow-400",
  "Estimate Sent": "bg-green-50 border-green-400",
  "Follow-Up": "bg-orange-50 border-orange-400",
  "Won": "bg-emerald-100 border-emerald-500",
  "Lost": "bg-red-50 border-red-300",
};

export function RoofingEstimatePipelineBoard() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [estimateRequestModalOpen, setEstimateRequestModalOpen] = useState(false);
  const [estimateUploadModalOpen, setEstimateUploadModalOpen] = useState(false);
  const [selectedLeadForEstimate, setSelectedLeadForEstimate] = useState<Lead | null>(null);

  useEffect(() => {
    loadPipeline();
  }, []);

  const loadPipeline = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/pipeline/roofing/board");
      if (!response.ok) throw new Error("Failed to load pipeline");
      const pipelineData = await response.json();
      setData(pipelineData);
    } catch (error) {
      console.error("Error loading pipeline:", error);
      toast.error("Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !data) return;

    const { source, destination, draggableId } = result;

    // If dropped in same position, do nothing
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const leadId = draggableId;
    const newStageName = destination.droppableId;

    // Optimistically update UI
    const updatedPipeline = { ...data.pipeline };
    const sourceStage = Object.keys(updatedPipeline).find((stage) =>
      updatedPipeline[stage].some((lead) => lead.id === leadId)
    );

    if (sourceStage) {
      const lead = updatedPipeline[sourceStage].find((l) => l.id === leadId);
      if (lead) {
        updatedPipeline[sourceStage] = updatedPipeline[sourceStage].filter(
          (l) => l.id !== leadId
        );
        if (!updatedPipeline[newStageName]) {
          updatedPipeline[newStageName] = [];
        }
        updatedPipeline[newStageName].push({
          ...lead,
          stage_name: newStageName,
        });
        setData({ ...data, pipeline: updatedPipeline });
      }
    }

    // Update on server
    try {
      const response = await fetch("/api/pipeline/roofing/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          stage_name: newStageName,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to move lead");
      }

      toast.success(`Lead moved to ${newStageName}`);
      // Refresh to get latest data
      loadPipeline();
    } catch (error) {
      console.error("Error moving lead:", error);
      toast.error("Failed to move lead");
      // Revert optimistic update
      loadPipeline();
    }
  };

  const handleCreateEstimateRequest = (lead: Lead) => {
    setSelectedLeadForEstimate(lead);
    setEstimateRequestModalOpen(true);
  };

  const handleUploadEstimate = (lead: Lead) => {
    setSelectedLeadForEstimate(lead);
    setEstimateUploadModalOpen(true);
  };

  const handleEstimateRequestCreated = () => {
    setEstimateRequestModalOpen(false);
    setSelectedLeadForEstimate(null);
    loadPipeline();
    toast.success("Estimate request created");
  };

  const handleEstimateUploaded = () => {
    setEstimateUploadModalOpen(false);
    setSelectedLeadForEstimate(null);
    loadPipeline();
    toast.success("Estimate uploaded and sent");
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">Loading pipeline...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="text-center text-red-500">Failed to load pipeline</div>
      </div>
    );
  }

  // Get stages in order
  const orderedStages = data.stages.length > 0
    ? data.stages.sort((a, b) => a.order_index - b.order_index)
    : [
        { id: "new", name: "New Lead", order_index: 1 },
        { id: "replied", name: "Replied", order_index: 2 },
        { id: "estimate_needed", name: "Estimate Needed", order_index: 3 },
        { id: "estimate_sent", name: "Estimate Sent", order_index: 4 },
        { id: "follow_up", name: "Follow-Up", order_index: 5 },
        { id: "won", name: "Won", order_index: 6 },
        { id: "lost", name: "Lost", order_index: 7 },
      ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Roofing Pipeline</h2>
          <p className="text-gray-600">
            {data.total_leads} leads across {orderedStages.length} stages
          </p>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {orderedStages.map((stage) => {
            const leads = data.pipeline[stage.name] || [];
            const stageColor = STAGE_COLORS[stage.name] || "bg-gray-100 border-gray-300";

            return (
              <div
                key={stage.id}
                className="flex-shrink-0 w-80"
              >
                <Card className={`${stageColor} h-full`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center justify-between">
                      <span>{stage.name}</span>
                      <Badge variant="secondary">{leads.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-2">
                    <Droppable droppableId={stage.name}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`min-h-[200px] space-y-2 ${
                            snapshot.isDraggingOver ? "bg-opacity-50" : ""
                          }`}
                        >
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
                                  className={`bg-white rounded-lg p-3 shadow-sm border cursor-move hover:shadow-md transition-shadow ${
                                    snapshot.isDragging ? "shadow-lg" : ""
                                  }`}
                                  onClick={() => {
                                    setSelectedLead(lead);
                                    setDrawerOpen(true);
                                  }}
                                >
                                  <div className="space-y-2">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="font-medium text-sm">
                                          {lead.first_name || lead.last_name
                                            ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
                                            : lead.email || "Unknown"}
                                        </div>
                                        {lead.email && (
                                          <div className="text-xs text-gray-500 mt-1">
                                            {lead.email}
                                          </div>
                                        )}
                                        {lead.phone && (
                                          <div className="text-xs text-gray-500">
                                            {lead.phone}
                                          </div>
                                        )}
                                      </div>
                                      {lead.intent_classification && (
                                        <Badge
                                          variant={
                                            lead.intent_classification === "Hot"
                                              ? "destructive"
                                              : lead.intent_classification === "Warm"
                                              ? "default"
                                              : "secondary"
                                          }
                                          className="text-xs"
                                        >
                                          {lead.intent_classification}
                                        </Badge>
                                      )}
                                    </div>

                                    {lead.address && (
                                      <div className="text-xs text-gray-600">
                                        {lead.address}
                                        {lead.city && `, ${lead.city}`}
                                        {lead.state && ` ${lead.state}`}
                                        {lead.zip_code && ` ${lead.zip_code}`}
                                      </div>
                                    )}

                                    <div className="flex items-center gap-2 flex-wrap">
                                      {lead.estimate_request && (
                                        <Badge variant="outline" className="text-xs">
                                          <FileText className="w-3 h-3 mr-1" />
                                          Request
                                        </Badge>
                                      )}
                                      {lead.latest_estimate && (
                                        <Badge variant="outline" className="text-xs">
                                          <DollarSign className="w-3 h-3 mr-1" />
                                          {lead.latest_estimate.price
                                            ? `$${Number(lead.latest_estimate.price).toLocaleString()}`
                                            : "Sent"}
                                        </Badge>
                                      )}
                                      {lead.has_pending_followup && (
                                        <Badge variant="outline" className="text-xs border-orange-400">
                                          <Clock className="w-3 h-3 mr-1" />
                                          Follow-up
                                        </Badge>
                                      )}
                                    </div>

                                    {stage.name === "Estimate Needed" && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="w-full mt-2"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCreateEstimateRequest(lead);
                                        }}
                                      >
                                        <Plus className="w-3 h-3 mr-1" />
                                        Create Request
                                      </Button>
                                    )}

                                    {stage.name === "Estimate Sent" && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="w-full mt-2"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleUploadEstimate(lead);
                                        }}
                                      >
                                        <FileText className="w-3 h-3 mr-1" />
                                        Upload Estimate
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Modals and Drawers */}
      {selectedLeadForEstimate && (
        <>
          <EstimateRequestModal
            open={estimateRequestModalOpen}
            onClose={() => {
              setEstimateRequestModalOpen(false);
              setSelectedLeadForEstimate(null);
            }}
            lead={selectedLeadForEstimate}
            onSuccess={handleEstimateRequestCreated}
          />
          <EstimateUploadModal
            open={estimateUploadModalOpen}
            onClose={() => {
              setEstimateUploadModalOpen(false);
              setSelectedLeadForEstimate(null);
            }}
            lead={selectedLeadForEstimate}
            onSuccess={handleEstimateUploaded}
          />
        </>
      )}

      <LeadDetailDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedLead(null);
        }}
        lead={selectedLead}
        onUpdate={loadPipeline}
      />
    </div>
  );
}



























