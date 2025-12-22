"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Droppable, 
  Draggable, 
  DragDropContext, 
  DropResult 
} from "@hello-pangea/dnd";
import { 
  FileText, 
  CheckCircle, 
  Shield, 
  Package, 
  Calendar, 
  Wrench, 
  CheckCircle2,
  Plus,
  AlertCircle
} from "lucide-react";
import Link from "next/link";
import { ProductionDashboard } from "./ProductionDashboard";

const STAGES = [
  { id: 'estimate', label: 'Estimate Sent', icon: FileText, color: 'bg-blue-500' },
  { id: 'approved', label: 'Approved', icon: CheckCircle, color: 'bg-green-500' },
  { id: 'insurance', label: 'Insurance', icon: Shield, color: 'bg-purple-500' },
  { id: 'materials', label: 'Materials Ordered', icon: Package, color: 'bg-orange-500' },
  { id: 'scheduled', label: 'Scheduled', icon: Calendar, color: 'bg-yellow-500' },
  { id: 'in_progress', label: 'In Progress', icon: Wrench, color: 'bg-indigo-500' },
  { id: 'completed', label: 'Completed', icon: CheckCircle2, color: 'bg-gray-500' },
];

interface Job {
  id: string;
  lead_id: string | null;
  stage: string;
  contract_value: number | null;
  insurance: boolean;
  notes: string | null;
  created_at: string;
  lead_name: string | null;
  lead_email: string | null;
  lead_phone: string | null;
  materials_status: string | null;
  crew_name: string | null;
  start_date: string | null;
}

interface JobPipelineKanbanProps {
  teamId: string;
  initialJobs: Record<string, Job[]>;
  initialMetrics: any;
}

export function JobPipelineKanban({ 
  teamId, 
  initialJobs, 
  initialMetrics 
}: JobPipelineKanbanProps) {
  const supabase = createClientComponentClient();
  const [jobs, setJobs] = useState<Record<string, Job[]>>(initialJobs);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [loading, setLoading] = useState(false);

  // Realtime subscription for job updates
  useEffect(() => {
    const channel = supabase
      .channel('jobs-pipeline')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `team_id=eq.${teamId}`
        },
        () => {
          refreshJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, supabase]);

  const refreshJobs = async () => {
    setLoading(true);
    try {
      const newJobs: Record<string, Job[]> = {};
      
      for (const stage of STAGES.map(s => s.id)) {
        const { data, error } = await supabase.rpc('get_jobs_by_stage', {
          p_team_id: teamId,
          p_stage: stage
        });
        
        if (!error && data) {
          newJobs[stage] = data;
        } else {
          newJobs[stage] = [];
        }
      }
      
      setJobs(newJobs);

      // Refresh metrics
      const { data: newMetrics } = await supabase.rpc('get_production_dashboard', {
        p_team_id: teamId
      });
      setMetrics(newMetrics);
    } catch (error) {
      console.error('Error refreshing jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const { draggableId, destination } = result;
    const newStage = destination.droppableId;

    // Optimistic update
    const jobId = draggableId;
    const sourceStage = Object.keys(jobs).find(stage => 
      jobs[stage].some(j => j.id === jobId)
    );

    if (!sourceStage || sourceStage === newStage) return;

    const job = jobs[sourceStage].find(j => j.id === jobId);
    if (!job) return;

    // Update local state
    setJobs(prev => {
      const newJobs = { ...prev };
      newJobs[sourceStage] = newJobs[sourceStage].filter(j => j.id !== jobId);
      newJobs[newStage] = [...(newJobs[newStage] || []), { ...job, stage: newStage }];
      return newJobs;
    });

    // Update in database
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ stage: newStage })
        .eq('id', jobId);

      if (error) {
        console.error('Error updating job stage:', error);
        // Revert optimistic update
        refreshJobs();
      } else {
        // Trigger customer notification via edge function
        try {
          await fetch('/api/jobs/update-stage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              job_id: jobId,
              stage: newStage,
              lead_id: job.lead_id
            })
          });
        } catch (notifyError) {
          console.error('Error sending notification:', notifyError);
          // Don't fail the update if notification fails
        }
      }
    } catch (error) {
      console.error('Error updating job:', error);
      refreshJobs();
    }
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Production Dashboard */}
      <ProductionDashboard metrics={metrics} />

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        <DragDropContext onDragEnd={onDragEnd}>
          {STAGES.map((stage) => {
            const Icon = stage.icon;
            const stageJobs = jobs[stage.id] || [];

            return (
              <div
                key={stage.id}
                className="flex-shrink-0 w-80 bg-muted/50 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded ${stage.color} text-white`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <h3 className="font-semibold text-sm">{stage.label}</h3>
                    <Badge variant="secondary" className="ml-2">
                      {stageJobs.length}
                    </Badge>
                  </div>
                </div>

                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-[200px] space-y-2 ${
                        snapshot.isDraggingOver ? 'bg-muted/80' : ''
                      }`}
                    >
                      {stageJobs.map((job, index) => (
                        <Draggable
                          key={job.id}
                          draggableId={job.id}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <Card
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`cursor-move ${
                                snapshot.isDragging ? 'shadow-lg' : ''
                              }`}
                            >
                              <CardHeader className="pb-2">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <CardTitle className="text-sm font-medium">
                                      {job.lead_name || 'Unknown Customer'}
                                    </CardTitle>
                                    {job.contract_value && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {formatCurrency(job.contract_value)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent className="pt-0 space-y-2">
                                {/* Materials Status */}
                                {job.materials_status && job.materials_status !== 'none' && (
                                  <div className="flex items-center gap-1 text-xs">
                                    <Package className="h-3 w-3" />
                                    <span className={
                                      job.materials_status === 'delivered' 
                                        ? 'text-green-600' 
                                        : 'text-orange-600'
                                    }>
                                      {job.materials_status === 'delivered' 
                                        ? 'Delivered' 
                                        : 'Pending'}
                                    </span>
                                  </div>
                                )}

                                {/* Crew & Schedule */}
                                {job.crew_name && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Calendar className="h-3 w-3" />
                                    <span>{job.crew_name}</span>
                                    {job.start_date && (
                                      <span className="ml-1">
                                        • {new Date(job.start_date).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Insurance Badge */}
                                {job.insurance && (
                                  <Badge variant="outline" className="text-xs">
                                    <Shield className="h-3 w-3 mr-1" />
                                    Insurance
                                  </Badge>
                                )}

                                {/* Actions */}
                                <div className="flex gap-2 pt-2">
                                  <Link
                                    href={`/production/jobs/${job.id}`}
                                    className="flex-1"
                                  >
                                    <Button variant="outline" size="sm" className="w-full text-xs">
                                      View Details
                                    </Button>
                                  </Link>
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </DragDropContext>
      </div>
    </div>
  );
}


































