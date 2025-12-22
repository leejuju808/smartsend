"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Droppable, 
  Draggable, 
  DragDropContext, 
  DropResult 
} from "@hello-pangea/dnd";
import { 
  Package, 
  Calendar, 
  User,
  DollarSign,
  Building2,
  ChevronRight
} from "lucide-react";
import { JobDetailsDrawer } from "./JobDetailsDrawer";

interface Stage {
  id: string;
  name: string;
  order_index: number;
  color: string | null;
  icon: string | null;
  job_count: number;
}

interface Job {
  id: string;
  lead_id: string | null;
  stage_id: string;
  stage_name: string | null;
  progress: number;
  contract_value: number | null;
  insurance: boolean;
  notes: string | null;
  created_at: string;
  homeowner_name: string | null;
  address: string | null;
  crew_name: string | null;
  production_date: string | null;
  estimated_value: number | null;
  final_value: number | null;
  job_type: string | null;
  roof_type: string | null;
  insurance_claim: boolean;
  materials: any;
}

interface PipelineKanbanBoardProps {
  companyId: string;
  initialStages: Stage[];
  initialJobs: Record<string, Job[]>;
}

export function PipelineKanbanBoard({ 
  companyId, 
  initialStages,
  initialJobs
}: PipelineKanbanBoardProps) {
  const supabase = createClientComponentClient();
  const [stages, setStages] = useState<Stage[]>(initialStages.sort((a, b) => a.order_index - b.order_index));
  const [jobs, setJobs] = useState<Record<string, Job[]>>(initialJobs);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);

  // Realtime subscription for job updates
  useEffect(() => {
    const channel = supabase
      .channel('pipeline-jobs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `company_id=eq.${companyId}`
        },
        () => {
          refreshData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, supabase]);

  const refreshData = async () => {
    setLoading(true);
    try {
      // Refresh stages
      const { data: newStages } = await supabase.rpc('get_pipeline_stages_with_counts', {
        p_company_id: companyId
      });

      if (newStages) {
        setStages(newStages.sort((a: Stage, b: Stage) => a.order_index - b.order_index));
      }

      // Refresh jobs
      const newJobs: Record<string, Job[]> = {};
      for (const stage of stages) {
        const { data: stageJobs } = await supabase.rpc('get_jobs_by_stage_id', {
          p_company_id: companyId,
          p_stage_id: stage.id
        });
        newJobs[stage.id] = stageJobs || [];
      }
      setJobs(newJobs);
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const { draggableId, destination } = result;
    const newStageId = destination.droppableId;
    const jobId = draggableId;

    // Find source stage
    const sourceStageId = Object.keys(jobs).find(stageId => 
      jobs[stageId].some(j => j.id === jobId)
    );

    if (!sourceStageId || sourceStageId === newStageId) return;

    const job = jobs[sourceStageId].find(j => j.id === jobId);
    if (!job) return;

    // Optimistic update
    setJobs(prev => {
      const newJobs = { ...prev };
      newJobs[sourceStageId] = newJobs[sourceStageId].filter(j => j.id !== jobId);
      newJobs[newStageId] = [...(newJobs[newStageId] || []), { ...job, stage_id: newStageId }];
      return newJobs;
    });

    // Update in database
    try {
      const response = await fetch(`/api/pipeline/jobs/${jobId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: newStageId }),
      });

      if (!response.ok) {
        throw new Error('Failed to move job');
      }

      // Refresh to get updated data
      await refreshData();
    } catch (error) {
      console.error('Error moving job:', error);
      // Revert optimistic update
      await refreshData();
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

  const formatDate = (date: string | null) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <div className="space-y-6">
      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[600px]">
        <DragDropContext onDragEnd={onDragEnd}>
          {stages.map((stage) => {
            const stageJobs = jobs[stage.id] || [];
            const stageColor = stage.color || '#94a3b8';

            return (
              <div
                key={stage.id}
                className="flex-shrink-0 w-80 bg-muted/50 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div 
                      className="p-1.5 rounded text-white"
                      style={{ backgroundColor: stageColor }}
                    >
                      <Building2 className="h-4 w-4" />
                    </div>
                    <h3 className="font-semibold text-sm">{stage.name}</h3>
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
                      className={`min-h-[500px] space-y-2 ${
                        snapshot.isDraggingOver ? 'bg-muted/80 rounded' : ''
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
                              className={`cursor-move hover:shadow-md transition-shadow ${
                                snapshot.isDragging ? 'shadow-lg rotate-2' : ''
                              }`}
                              onClick={() => setSelectedJob(job)}
                            >
                              <CardHeader className="pb-2">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                                      {job.homeowner_name || 'Unknown Customer'}
                                      {job.insurance_claim && (
                                        <Badge variant="outline" className="text-xs">
                                          Insurance
                                        </Badge>
                                      )}
                                    </CardTitle>
                                    {job.address && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {job.address}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent className="pt-0 space-y-2">
                                {/* Job Value */}
                                {(job.estimated_value || job.final_value) && (
                                  <div className="flex items-center gap-1 text-xs font-medium">
                                    <DollarSign className="h-3 w-3" />
                                    <span>
                                      {formatCurrency(job.final_value || job.estimated_value)}
                                    </span>
                                  </div>
                                )}

                                {/* Progress Bar */}
                                {job.progress > 0 && (
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">Progress</span>
                                      <span className="font-medium">{job.progress}%</span>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-primary transition-all"
                                        style={{ width: `${job.progress}%` }}
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Materials Status */}
                                {job.materials && Array.isArray(job.materials) && job.materials.length > 0 && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Package className="h-3 w-3" />
                                    <span>{job.materials.length} materials</span>
                                  </div>
                                )}

                                {/* Crew & Production Date */}
                                {(job.crew_name || job.production_date) && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Calendar className="h-3 w-3" />
                                    {job.crew_name && <span>{job.crew_name}</span>}
                                    {job.production_date && (
                                      <span className="ml-1">
                                        {job.crew_name ? '•' : ''} {formatDate(job.production_date)}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Job Type */}
                                {job.job_type && (
                                  <Badge variant="secondary" className="text-xs">
                                    {job.job_type.replace('_', ' ')}
                                  </Badge>
                                )}

                                {/* Last Activity */}
                                <div className="pt-2 border-t text-xs text-muted-foreground">
                                  {formatDate(job.created_at)}
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

      {/* Job Details Drawer */}
      {selectedJob && (
        <JobDetailsDrawer
          job={selectedJob}
          companyId={companyId}
          onClose={() => setSelectedJob(null)}
          onUpdate={refreshData}
        />
      )}
    </div>
  );
}


























