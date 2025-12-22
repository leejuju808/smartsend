"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface Crew {
  id: string;
  name: string;
  leader_phone: string | null;
  skills: string[];
  max_jobs_per_day: number;
  is_active: boolean;
}

interface CrewRecommendation {
  crew_id: string;
  crew_name: string;
  leader_phone: string;
  skills: string[];
  current_jobs_today: number;
  max_jobs_per_day: number;
  is_available: boolean;
  skill_match_score: number;
}

interface CrewAssignmentPanelProps {
  jobId: string;
  onCrewAssigned?: (crewId: string) => void;
}

export function CrewAssignmentPanel({ jobId, onCrewAssigned }: CrewAssignmentPanelProps) {
  const [recommendations, setRecommendations] = useState<CrewRecommendation[]>([]);
  const [allCrews, setAllCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignedCrew, setAssignedCrew] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [jobId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Get recommendations
      const recResponse = await fetch(`/api/jobs/${jobId}/recommend-crew`);
      if (recResponse.ok) {
        const recData = await recResponse.json();
        setRecommendations(recData.recommendations || []);
      }

      // Get all crews
      const crewsResponse = await fetch("/api/crews");
      if (crewsResponse.ok) {
        const crewsData = await crewsResponse.json();
        setAllCrews(crewsData.crews || []);
      }

      // Get currently assigned crew
      const statusResponse = await fetch(`/api/jobs/${jobId}/install-day-status`);
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        if (statusData.status?.assigned_crew?.crew_id) {
          setAssignedCrew(statusData.status.assigned_crew.crew_id);
        }
      }
    } catch (error) {
      console.error("Error loading crew data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignCrew = async (crewId: string) => {
    try {
      setAssigning(crewId);
      const response = await fetch(`/api/jobs/${jobId}/assign-crew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crew_id: crewId, is_primary: true }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to assign crew");
      }

      const data = await response.json();
      setAssignedCrew(crewId);
      if (onCrewAssigned) {
        onCrewAssigned(crewId);
      }
    } catch (error: any) {
      alert(error.message || "Failed to assign crew");
    } finally {
      setAssigning(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const recommendedCrew = recommendations.find((r) => r.is_available && r.skill_match_score > 0);
  const availableCrews = recommendations.filter((r) => r.is_available);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Crew Assignment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {assignedCrew && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium">Crew Assigned</span>
            </div>
            <p className="text-sm text-green-700 mt-1">
              {allCrews.find((c) => c.id === assignedCrew)?.name || "Crew assigned"}
            </p>
          </div>
        )}

        {recommendedCrew && !assignedCrew && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-blue-800">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-medium">Recommended Crew</span>
                </div>
                <p className="text-sm text-blue-700 mt-1">{recommendedCrew.crew_name}</p>
                <div className="flex gap-2 mt-2">
                  {recommendedCrew.skills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button
                onClick={() => handleAssignCrew(recommendedCrew.crew_id)}
                disabled={assigning === recommendedCrew.crew_id}
                size="sm"
              >
                {assigning === recommendedCrew.crew_id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Assign"
                )}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Available Crews</h4>
          {availableCrews.length === 0 ? (
            <p className="text-sm text-muted-foreground">No available crews found</p>
          ) : (
            <div className="space-y-2">
              {availableCrews.map((crew) => (
                <div
                  key={crew.crew_id}
                  className="p-3 border rounded-md flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{crew.crew_name}</span>
                      {crew.crew_id === recommendedCrew?.crew_id && (
                        <Badge variant="default" className="text-xs">
                          Recommended
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2 mt-1">
                      {crew.skills.map((skill) => (
                        <Badge key={skill} variant="outline" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {crew.current_jobs_today}/{crew.max_jobs_per_day} jobs today •{" "}
                      {crew.skill_match_score}% skill match
                    </p>
                  </div>
                  <Button
                    onClick={() => handleAssignCrew(crew.crew_id)}
                    disabled={assigning === crew.crew_id || assignedCrew === crew.crew_id}
                    size="sm"
                    variant={assignedCrew === crew.crew_id ? "default" : "outline"}
                  >
                    {assigning === crew.crew_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : assignedCrew === crew.crew_id ? (
                      "Assigned"
                    ) : (
                      "Assign"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

































