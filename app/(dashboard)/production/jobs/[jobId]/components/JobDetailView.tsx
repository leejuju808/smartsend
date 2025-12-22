"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Calendar, 
  Package, 
  Camera, 
  CheckSquare, 
  FileText,
  Phone,
  Mail,
  DollarSign,
  Shield,
  Clock,
  Plus,
  Upload
} from "lucide-react";
import { format } from "date-fns";
import { JobStageTimeline } from "./JobStageTimeline";
import { JobMaterialsTracker } from "./JobMaterialsTracker";
import { JobSchedulePanel } from "./JobSchedulePanel";
import { JobPhotosGallery } from "./JobPhotosGallery";
import { JobTasksList } from "./JobTasksList";
import { JobNotesPanel } from "./JobNotesPanel";
import { ChangeOrderPanel } from "./ChangeOrderPanel";
import { CreateChangeOrderDialog } from "./CreateChangeOrderDialog";
import { CloseoutPacketPanel } from "./CloseoutPacketPanel";

const STAGE_LABELS: Record<string, string> = {
  estimate: "Estimate Sent",
  approved: "Approved",
  insurance: "Insurance Processing",
  materials: "Materials Ordered",
  scheduled: "Scheduled for Install",
  in_progress: "In Progress",
  completed: "Completed",
};

interface JobDetailViewProps {
  job: any;
  lead: any;
  stageEvents: any[];
  materials: any[];
  schedule: any;
  photos: any[];
  tasks: any[];
}

export function JobDetailView({
  job,
  lead,
  stageEvents,
  materials,
  schedule,
  photos,
  tasks,
}: JobDetailViewProps) {
  const supabase = createClientComponentClient();
  const [currentStage, setCurrentStage] = useState(job.stage);
  const [notes, setNotes] = useState(job.notes || "");

  const formatCurrency = (value: number | null) => {
    if (!value) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const handleStageChange = async (newStage: string) => {
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ stage: newStage })
        .eq('id', job.id);

      if (error) throw error;

      setCurrentStage(newStage);

      // Trigger customer notification
      try {
        await fetch('/api/jobs/update-stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: job.id,
            stage: newStage,
            lead_id: job.lead_id
          })
        });
      } catch (notifyError) {
        console.error('Error sending notification:', notifyError);
      }

      // Refresh page to show updated data
      window.location.reload();
    } catch (error) {
      console.error('Error updating stage:', error);
      alert('Failed to update stage. Please try again.');
    }
  };

  const handleNotesSave = async () => {
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ notes })
        .eq('id', job.id);

      if (error) throw error;
      alert('Notes saved successfully!');
    } catch (error) {
      console.error('Error saving notes:', error);
      alert('Failed to save notes. Please try again.');
    }
  };

  const leadName = lead 
    ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown'
    : 'Unknown';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{leadName}</h1>
          {lead?.email && (
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Mail className="h-4 w-4" />
                <span>{lead.email}</span>
              </div>
              {lead?.phone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  <span>{lead.phone}</span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            {STAGE_LABELS[currentStage] || currentStage}
          </Badge>
          {job.insurance && (
            <Badge variant="outline">
              <Shield className="h-3 w-3 mr-1" />
              Insurance
            </Badge>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {job.contract_value && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Contract Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                <p className="text-2xl font-bold">{formatCurrency(job.contract_value)}</p>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Created
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <p className="text-sm">
                {format(new Date(job.created_at), 'MMM d, yyyy')}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Stage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <select
              value={currentStage}
              onChange={(e) => handleStageChange(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              {Object.entries(STAGE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="timeline" className="w-full">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="costing">Costing</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="closeout">Closeout</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          <JobStageTimeline events={stageEvents} />
        </TabsContent>

        <TabsContent value="materials" className="mt-4">
          <JobMaterialsTracker jobId={job.id} materials={materials} />
        </TabsContent>

        <TabsContent value="schedule" className="mt-4">
          <JobSchedulePanel jobId={job.id} schedule={schedule} />
        </TabsContent>

        <TabsContent value="photos" className="mt-4">
          <JobPhotosGallery jobId={job.id} photos={photos} />
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <JobTasksList jobId={job.id} tasks={tasks} />
        </TabsContent>

        <TabsContent value="costing" className="mt-4">
          <JobCostingPanel jobId={job.id} />
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <JobNotesPanel 
            jobId={job.id} 
            notes={notes} 
            onNotesChange={setNotes}
            onSave={handleNotesSave}
          />
        </TabsContent>

        <TabsContent value="closeout" className="mt-4">
          <CloseoutPacketPanel jobId={job.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}


