"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Plus, Edit, Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface JobSchedulePanelProps {
  jobId: string;
  workspaceId?: string;
  schedule: {
    id: string;
    crew_name: string | null;
    start_date: string | null;
    duration_days: number | null;
    notes: string | null;
  } | null;
}

export function JobSchedulePanel({ jobId, workspaceId, schedule: initialSchedule }: JobSchedulePanelProps) {
  const supabase = createClientComponentClient();
  const [schedule, setSchedule] = useState(initialSchedule);
  const [isEditing, setIsEditing] = useState(!initialSchedule);
  const [aiRecommendation, setAiRecommendation] = useState<any>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [workspaceIdState, setWorkspaceIdState] = useState<string | null>(workspaceId || null);
  const [formData, setFormData] = useState({
    crew_name: initialSchedule?.crew_name || '',
    start_date: initialSchedule?.start_date 
      ? format(new Date(initialSchedule.start_date), 'yyyy-MM-dd')
      : '',
    duration_days: initialSchedule?.duration_days?.toString() || '',
    notes: initialSchedule?.notes || '',
  });

  // Fetch workspace_id if not provided
  useEffect(() => {
    if (!workspaceIdState) {
      const fetchWorkspace = async () => {
        const { data: job } = await supabase
          .from("roofing_jobs")
          .select("workspace_id")
          .eq("id", jobId)
          .single();
        if (job?.workspace_id) {
          setWorkspaceIdState(job.workspace_id);
        }
      };
      fetchWorkspace();
    }
  }, [workspaceIdState, jobId, supabase]);

  const handleAISuggest = async () => {
    if (!workspaceIdState) {
      alert("Workspace ID not found. Please refresh the page.");
      return;
    }

    setLoadingAI(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("Please sign in to use AI scheduling");
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/schedule/ai-recommend`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            job_id: jobId,
            workspace_id: workspaceIdState,
            consider_weather: true,
            lookahead_days: 30,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to get AI recommendation");
      }

      const data = await response.json();
      setAiRecommendation(data);

      // Auto-populate form with recommendation
      if (data.recommended_dates) {
        setFormData({
          ...formData,
          start_date: data.recommended_dates.start,
          crew_name: data.recommended_crew?.name || formData.crew_name,
          duration_days: data.estimated_duration?.days?.toString() || formData.duration_days,
        });
      }
    } catch (error: any) {
      console.error("Error getting AI recommendation:", error);
      alert(error.message || "Failed to get AI recommendation");
    } finally {
      setLoadingAI(false);
    }
  };

  const handleAcceptAIRecommendation = async () => {
    if (!aiRecommendation || !workspaceIdState) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Call homeowner-approve endpoint to accept
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/schedule/homeowner-approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            job_id: jobId,
            workspace_id: workspaceIdState,
            response: "accepted",
            proposed_start_date: aiRecommendation.recommended_dates.start,
            proposed_end_date: aiRecommendation.recommended_dates.end,
          }),
        }
      );

      if (response.ok) {
        alert("Schedule accepted and updated!");
        window.location.reload();
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to accept recommendation");
      }
    } catch (error: any) {
      console.error("Error accepting recommendation:", error);
      alert(error.message || "Failed to accept recommendation");
    }
  };

  const handleSave = async () => {
    try {
      if (schedule) {
        // Update existing
        const { data, error } = await supabase
          .from('job_schedule')
          .update({
            crew_name: formData.crew_name || null,
            start_date: formData.start_date || null,
            duration_days: formData.duration_days ? parseInt(formData.duration_days) : null,
            notes: formData.notes || null,
          })
          .eq('id', schedule.id)
          .select()
          .single();

        if (error) throw error;
        setSchedule(data);
      } else {
        // Create new
        const { data, error } = await supabase
          .from('job_schedule')
          .insert({
            job_id: jobId,
            crew_name: formData.crew_name || null,
            start_date: formData.start_date || null,
            duration_days: formData.duration_days ? parseInt(formData.duration_days) : null,
            notes: formData.notes || null,
          })
          .select()
          .single();

        if (error) throw error;
        setSchedule(data);
      }

      setIsEditing(false);
    } catch (error) {
      console.error('Error saving schedule:', error);
      alert('Failed to save schedule. Please try again.');
    }
  };

  if (!isEditing && schedule) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Schedule
            </CardTitle>
            <div className="flex gap-2">
              <Button 
                onClick={handleAISuggest} 
                variant="outline" 
                size="sm"
                disabled={loadingAI}
              >
                {loadingAI ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                AI Suggest Date
              </Button>
              <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {schedule.crew_name && (
              <div>
                <p className="text-sm text-muted-foreground">Crew</p>
                <p className="font-medium">{schedule.crew_name}</p>
              </div>
            )}
            {schedule.start_date && (
              <div>
                <p className="text-sm text-muted-foreground">Start Date</p>
                <p className="font-medium">
                  {format(new Date(schedule.start_date), 'MMM d, yyyy')}
                </p>
              </div>
            )}
            {schedule.duration_days && (
              <div>
                <p className="text-sm text-muted-foreground">Duration</p>
                <p className="font-medium">{schedule.duration_days} days</p>
              </div>
            )}
            {schedule.notes && (
              <div>
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="text-sm">{schedule.notes}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Schedule
          </CardTitle>
          <Button 
            onClick={handleAISuggest} 
            variant="outline" 
            size="sm"
            disabled={loadingAI}
          >
            {loadingAI ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            AI Suggest Date
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {aiRecommendation && (
          <Alert className={aiRecommendation.conflicts?.has_conflicts ? "border-yellow-500" : "border-green-500"}>
            <div className="flex items-start gap-2">
              {aiRecommendation.conflicts?.has_conflicts ? (
                <AlertCircle className="h-4 w-4 mt-0.5 text-yellow-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
              )}
              <div className="flex-1">
                <AlertDescription>
                  <div className="space-y-2">
                    <div>
                      <strong>AI Recommendation:</strong>
                      <div className="mt-1 space-y-1 text-sm">
                        <div>Start: {format(new Date(aiRecommendation.recommended_dates.start), 'MMM d, yyyy')}</div>
                        <div>End: {format(new Date(aiRecommendation.recommended_dates.end), 'MMM d, yyyy')}</div>
                        <div>Crew: {aiRecommendation.recommended_crew?.name}</div>
                        <div>Duration: {aiRecommendation.estimated_duration?.days} days ({aiRecommendation.estimated_duration?.hours} hours)</div>
                        <div>Confidence: {Math.round(aiRecommendation.confidence * 100)}%</div>
                      </div>
                    </div>
                    {aiRecommendation.conflicts?.has_conflicts && (
                      <div className="mt-2">
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-800">
                          Conflicts detected: {aiRecommendation.conflicts.count}
                        </Badge>
                      </div>
                    )}
                    {aiRecommendation.weather?.risk !== "low" && (
                      <div className="mt-2">
                        <Badge variant="outline" className="bg-orange-50 text-orange-800">
                          Weather risk: {aiRecommendation.weather.risk}
                        </Badge>
                      </div>
                    )}
                    <div className="flex gap-2 mt-2">
                      <Button onClick={handleAcceptAIRecommendation} size="sm" className="flex-1">
                        Accept Recommendation
                      </Button>
                      <Button 
                        onClick={() => setAiRecommendation(null)} 
                        variant="outline" 
                        size="sm"
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}
        <input
          type="text"
          placeholder="Crew Name"
          value={formData.crew_name}
          onChange={(e) => setFormData({ ...formData, crew_name: e.target.value })}
          className="w-full px-3 py-2 border rounded-md text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            placeholder="Start Date"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            className="px-3 py-2 border rounded-md text-sm"
          />
          <input
            type="number"
            placeholder="Duration (days)"
            value={formData.duration_days}
            onChange={(e) => setFormData({ ...formData, duration_days: e.target.value })}
            className="px-3 py-2 border rounded-md text-sm"
          />
        </div>
        <textarea
          placeholder="Notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          className="w-full px-3 py-2 border rounded-md text-sm"
          rows={3}
        />
        <div className="flex gap-2">
          <Button onClick={handleSave} size="sm">Save</Button>
          {schedule && (
            <Button onClick={() => setIsEditing(false)} variant="outline" size="sm">
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}



