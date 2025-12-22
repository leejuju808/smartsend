"use client";

import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClientComponentClient } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Mail, Calendar, CheckCircle2, Clock } from "lucide-react";

interface Lead {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  pipeline_stage: string;
  demo_scheduled_at: string | null;
  closed_at: string | null;
  closed_reason: string | null;
  last_email_at: string | null;
  reply_date: string | null;
}

const STAGES = [
  { id: "Contacted", label: "Contacted", icon: Mail, color: "bg-blue-50 border-blue-200" },
  { id: "Replied", label: "Replied", icon: MessageSquare, color: "bg-green-50 border-green-200" },
  { id: "Demo Scheduled", label: "Demo Scheduled", icon: Calendar, color: "bg-purple-50 border-purple-200" },
  { id: "Closed", label: "Closed", icon: CheckCircle2, color: "bg-gray-50 border-gray-200" },
];

import { MessageSquare } from "lucide-react";

export default function CRMPipelineView() {
  const [leads, setLeads] = useState<Record<string, Lead[]>>({
    Contacted: [],
    Replied: [],
    "Demo Scheduled": [],
    Closed: [],
  });
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadLeads();
  }, []);

  async function loadLeads() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's org_id from profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id, team_id")
        .eq("id", user.id)
        .maybeSingle();

      // Get leads with pipeline stages
      const { data: leadsData, error } = await supabase
        .from("leads")
        .select(`
          id,
          email,
          first_name,
          last_name,
          company,
          title,
          pipeline_stage,
          demo_scheduled_at,
          closed_at,
          closed_reason,
          replied_at,
          updated_at
        `)
        .in("pipeline_stage", STAGES.map(s => s.id))
        .order("updated_at", { ascending: false })
        .limit(200);

      if (error) {
        console.error("Error loading leads:", error);
        return;
      }

      // Group leads by stage
      const grouped: Record<string, Lead[]> = {
        Contacted: [],
        Replied: [],
        "Demo Scheduled": [],
        Closed: [],
      };

      leadsData?.forEach((lead) => {
        const stage = lead.pipeline_stage || "Contacted";
        if (grouped[stage]) {
          grouped[stage].push({
            ...lead,
            last_email_at: lead.updated_at,
            reply_date: lead.replied_at,
          });
        }
      });

      setLeads(grouped);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    if (result.source.droppableId === result.destination.droppableId) return;

    const leadId = result.draggableId;
    const newStage = result.destination.droppableId;
    const oldStage = result.source.droppableId;

    // Optimistically update UI
    const updatedLeads = { ...leads };
    const lead = updatedLeads[oldStage]?.find((l) => l.id === leadId);
    if (!lead) return;

    updatedLeads[oldStage] = updatedLeads[oldStage].filter((l) => l.id !== leadId);
    lead.pipeline_stage = newStage;

    // Update timestamps based on stage
    if (newStage === "Demo Scheduled" && !lead.demo_scheduled_at) {
      lead.demo_scheduled_at = new Date().toISOString();
    }
    if (newStage === "Closed" && !lead.closed_at) {
      lead.closed_at = new Date().toISOString();
    }

    updatedLeads[newStage] = [lead, ...(updatedLeads[newStage] || [])];
    setLeads(updatedLeads);

    // Update in database
    try {
      const updateData: any = { pipeline_stage: newStage };
      
      if (newStage === "Demo Scheduled") {
        updateData.demo_scheduled_at = lead.demo_scheduled_at;
      } else if (newStage === "Closed") {
        updateData.closed_at = lead.closed_at;
      }

      const { error } = await supabase
        .from("leads")
        .update(updateData)
        .eq("id", leadId);

      if (error) throw error;

      // Create notification
      await supabase.from("notifications").insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        type: "pipeline_updated",
        severity: "info",
        title: "Lead moved",
        message: `${lead.email} moved to ${newStage}`,
        action_url: `/dashboard/pipeline`,
        sent_email: false,
        metadata: { lead_id: leadId, new_stage: newStage }
      });
    } catch (error) {
      console.error("Error updating lead stage:", error);
      // Revert on error
      loadLeads();
    }
  }

  if (loading) {
    return <div className="p-4">Loading pipeline...</div>;
  }

  const totalLeads = Object.values(leads).flat().length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Lead Pipeline</h2>
          <p className="text-sm text-gray-600 mt-1">
            {totalLeads} leads across {STAGES.length} stages
          </p>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STAGES.map((stage) => {
            const StageIcon = stage.icon;
            const stageLeads = leads[stage.id] || [];

            return (
              <Droppable droppableId={stage.id} key={stage.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`${stage.color} rounded-lg p-4 min-h-[500px] ${
                      snapshot.isDraggingOver ? "ring-2 ring-blue-400" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <StageIcon className="h-5 w-5" />
                      <h3 className="font-semibold">{stage.label}</h3>
                      <Badge variant="secondary" className="ml-auto">
                        {stageLeads.length}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      {stageLeads.map((lead, index) => (
                        <Draggable
                          key={lead.id}
                          draggableId={lead.id}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <Card
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`cursor-move ${
                                snapshot.isDragging ? "shadow-lg" : ""
                              }`}
                            >
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm">
                                  {lead.first_name || lead.last_name
                                    ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
                                    : lead.email.split("@")[0]}
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="pt-0 space-y-1">
                                {lead.company && (
                                  <p className="text-xs text-gray-600">
                                    {lead.company}
                                  </p>
                                )}
                                {lead.title && (
                                  <p className="text-xs text-gray-500">
                                    {lead.title}
                                  </p>
                                )}
                                <p className="text-xs text-gray-400 mt-2">
                                  {lead.email}
                                </p>
                                {lead.reply_date && (
                                  <div className="flex items-center gap-1 mt-2 text-xs text-green-600">
                                    <MessageSquare className="h-3 w-3" />
                                    Replied {new Date(lead.reply_date).toLocaleDateString()}
                                  </div>
                                )}
                                {lead.demo_scheduled_at && (
                                  <div className="flex items-center gap-1 mt-2 text-xs text-purple-600">
                                    <Calendar className="h-3 w-3" />
                                    Demo {new Date(lead.demo_scheduled_at).toLocaleDateString()}
                                  </div>
                                )}
                                {lead.closed_reason && (
                                  <p className="text-xs text-gray-500 mt-2 italic">
                                    {lead.closed_reason}
                                  </p>
                                )}
                              </CardContent>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>

                    {stageLeads.length === 0 && (
                      <div className="text-center text-gray-400 text-sm py-8">
                        No leads in this stage
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}

