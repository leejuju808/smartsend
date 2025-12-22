// Block 226000 — SmartSend Roofing Safety Compliance System
// Mobile UI Component: Complete safety flow for crew app
// Steps: PPE Check → Site Hazard Survey → Toolbox Talk → Incident Reporting → Safety Score

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, AlertTriangle, FileText, AlertCircle, TrendingUp } from "lucide-react";

interface SafetyComplianceFlowProps {
  dailyLogId: string;
  jobId: string;
  crewId: string;
  onComplete?: () => void;
}

export function SafetyComplianceFlow({
  dailyLogId,
  jobId,
  crewId,
  onComplete,
}: SafetyComplianceFlowProps) {
  const [step, setStep] = useState<"ppe" | "hazards" | "toolbox" | "complete">("ppe");
  const [loading, setLoading] = useState(false);
  const [ppeItems, setPpeItems] = useState<Array<{ id: string; label: string; completed: boolean; is_required: boolean }>>([]);
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const [safetyScore, setSafetyScore] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    loadSafetyChecklist();
  }, [dailyLogId]);

  const loadSafetyChecklist = async () => {
    try {
      const response = await fetch(`/api/safety/checklist/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyLogId, jobId, crewId }),
      });

      const data = await response.json();
      if (data.success && data.checklist) {
        setChecklistId(data.checklist.id);
        setPpeItems(
          data.checklist.items.map((item: any) => ({
            id: item.id,
            label: item.label,
            completed: item.completed || false,
            is_required: item.is_required,
          }))
        );
      }
    } catch (error) {
      console.error("Error loading safety checklist:", error);
    }
  };

  const handlePPEItemToggle = (itemId: string) => {
    setPpeItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const handlePPESubmit = async () => {
    if (!checklistId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/safety/ppe/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklistId,
          dailyLogId,
          jobId,
          items: ppeItems.map((item) => ({
            itemId: item.id,
            completed: item.completed,
          })),
        }),
      });

      const data = await response.json();
      if (data.success && !data.blocked) {
        setStep("hazards");
      } else if (data.blocked) {
        setBlocked(true);
        alert(`Job blocked: ${data.missingItems.join(", ")} must be completed before starting work.`);
      }
    } catch (error) {
      console.error("Error submitting PPE check:", error);
      alert("Failed to submit PPE check");
    } finally {
      setLoading(false);
    }
  };

  const handleHazardsSubmit = async (hazards: string[], severity: string, description: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/safety/hazards/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyLogId,
          jobId,
          crewId,
          hazards,
          severity,
          description,
        }),
      });

      const data = await response.json();
      if (data.success) {
        if (data.blocked) {
          alert("Severe hazard reported. Job has been stopped. Office has been notified.");
          setBlocked(true);
        } else {
          setStep("toolbox");
        }
      }
    } catch (error) {
      console.error("Error submitting hazards:", error);
      alert("Failed to submit hazard assessment");
    } finally {
      setLoading(false);
    }
  };

  const handleToolboxSubmit = async (talkId: string, workerName: string, signatureUrl?: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/safety/toolbox/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          talkId,
          crewId,
          workerName,
          signatureUrl,
          signed: true,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setStep("complete");
        loadSafetyScore();
        onComplete?.();
      }
    } catch (error) {
      console.error("Error submitting toolbox attendance:", error);
      alert("Failed to submit toolbox attendance");
    } finally {
      setLoading(false);
    }
  };

  const loadSafetyScore = async () => {
    try {
      const response = await fetch(`/api/safety/score/update?crewId=${crewId}`);
      const data = await response.json();
      if (data.success && data.scores?.[0]) {
        setSafetyScore(data.scores[0].score);
      }
    } catch (error) {
      console.error("Error loading safety score:", error);
    }
  };

  if (blocked) {
    return (
      <Card className="border-red-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            Job Blocked - Safety Issue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>
              This job has been blocked due to safety compliance issues. Please contact the office
              before proceeding.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step 1: PPE Check */}
      {step === "ppe" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Step 1: PPE Check (Required)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Complete all required items before starting work. Job cannot proceed until all
              required items are checked.
            </p>
            <div className="space-y-3">
              {ppeItems.map((item) => (
                <div key={item.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={item.id}
                    checked={item.completed}
                    onCheckedChange={() => handlePPEItemToggle(item.id)}
                  />
                  <label
                    htmlFor={item.id}
                    className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${
                      item.is_required ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {item.label}
                    {item.is_required && (
                      <Badge variant="destructive" className="ml-2 text-xs">
                        Required
                      </Badge>
                    )}
                  </label>
                </div>
              ))}
            </div>
            <Button onClick={handlePPESubmit} disabled={loading} className="w-full">
              {loading ? "Submitting..." : "Submit PPE Check"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Site Hazard Survey */}
      {step === "hazards" && (
        <HazardSurveyForm
          onSubmit={handleHazardsSubmit}
          loading={loading}
          onSkip={() => setStep("toolbox")}
        />
      )}

      {/* Step 3: Toolbox Talk */}
      {step === "toolbox" && (
        <ToolboxTalkForm
          dailyLogId={dailyLogId}
          crewId={crewId}
          onSubmit={handleToolboxSubmit}
          loading={loading}
          onSkip={() => {
            setStep("complete");
            onComplete?.();
          }}
        />
      )}

      {/* Complete: Safety Score Display */}
      {step === "complete" && (
        <Card className="border-green-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <Shield className="h-5 w-5" />
              Safety Compliance Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                All safety checks completed. You may proceed with work.
              </AlertDescription>
            </Alert>
            {safetyScore !== null && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Crew Safety Score</span>
                  <Badge
                    variant={
                      safetyScore >= 90
                        ? "default"
                        : safetyScore >= 70
                        ? "secondary"
                        : "destructive"
                    }
                    className="text-lg"
                  >
                    {safetyScore.toFixed(0)}/100
                  </Badge>
                </div>
                <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      safetyScore >= 90
                        ? "bg-green-500"
                        : safetyScore >= 70
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${safetyScore}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Hazard Survey Component
function HazardSurveyForm({
  onSubmit,
  loading,
  onSkip,
}: {
  onSubmit: (hazards: string[], severity: string, description: string) => void;
  loading: boolean;
  onSkip: () => void;
}) {
  const [hazards, setHazards] = useState<string[]>([]);
  const [severity, setSeverity] = useState<string>("low");
  const [description, setDescription] = useState("");

  const hazardOptions = [
    { id: "electrical", label: "⚡ Electrical / Power Lines", icon: "⚡" },
    { id: "dog", label: "🐕 Dog on Property", icon: "🐕" },
    { id: "soft_ground", label: "🚧 Soft Ground", icon: "🚧" },
    { id: "rotten_decking", label: "🪵 Rotten Decking", icon: "🪵" },
    { id: "weather_risk", label: "🌧 Weather Risk", icon: "🌧" },
    { id: "ladder_risk", label: "🪜 Ladder Setup Risk", icon: "🪜" },
    { id: "other_contractor", label: "👷 Other Contractor on Site", icon: "👷" },
    { id: "structural_issue", label: "⚠️ Structural Issue", icon: "⚠️" },
  ];

  const toggleHazard = (hazardId: string) => {
    setHazards((prev) =>
      prev.includes(hazardId) ? prev.filter((h) => h !== hazardId) : [...prev, hazardId]
    );
  };

  const handleSubmit = () => {
    onSubmit(hazards, severity, description);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Step 2: Site Hazard Assessment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Identify any hazards present on the job site. Severe hazards will automatically stop work.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {hazardOptions.map((hazard) => (
            <button
              key={hazard.id}
              type="button"
              onClick={() => toggleHazard(hazard.id)}
              className={`p-3 border rounded-lg text-left transition-colors ${
                hazards.includes(hazard.id)
                  ? "border-red-500 bg-red-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="text-sm font-medium">{hazard.label}</div>
            </button>
          ))}
        </div>
        {hazards.length > 0 && (
          <>
            <div>
              <label className="text-sm font-medium">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full mt-1 p-2 border rounded-md"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full mt-1 p-2 border rounded-md"
                rows={3}
                placeholder="Describe the hazard..."
              />
            </div>
          </>
        )}
        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={loading} className="flex-1">
            {loading ? "Submitting..." : "Submit Hazard Assessment"}
          </Button>
          <Button variant="outline" onClick={onSkip} className="flex-1">
            No Hazards
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Toolbox Talk Component
function ToolboxTalkForm({
  dailyLogId,
  crewId,
  onSubmit,
  loading,
  onSkip,
}: {
  dailyLogId: string;
  crewId: string;
  onSubmit: (talkId: string, workerName: string, signatureUrl?: string) => void;
  loading: boolean;
  onSkip: () => void;
}) {
  const [talkId, setTalkId] = useState<string | null>(null);
  const [workerName, setWorkerName] = useState("");

  useEffect(() => {
    // Load today's toolbox talk
    const loadToolboxTalk = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const response = await fetch(`/api/safety/toolbox/talks?date=${today}`);
        const data = await response.json();
        if (data.success && data.talks?.[0]) {
          setTalkId(data.talks[0].id);
        }
      } catch (error) {
        console.error("Error loading toolbox talk:", error);
      }
    };
    loadToolboxTalk();
  }, []);

  const handleSubmit = () => {
    if (talkId && workerName) {
      onSubmit(talkId, workerName);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Step 3: Toolbox Talk Sign-Off
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Review today's safety briefing and sign to confirm attendance.
        </p>
        <div>
          <label className="text-sm font-medium">Your Name</label>
          <input
            type="text"
            value={workerName}
            onChange={(e) => setWorkerName(e.target.value)}
            className="w-full mt-1 p-2 border rounded-md"
            placeholder="Enter your name"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={loading || !talkId || !workerName} className="flex-1">
            {loading ? "Submitting..." : "Sign & Submit"}
          </Button>
          <Button variant="outline" onClick={onSkip} className="flex-1">
            Skip
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

























