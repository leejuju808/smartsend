// Block 16500 — Intelligence Modules Panel
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { 
  Flame, 
  CloudLightning, 
  Shield, 
  DollarSign, 
  FolderOpen, 
  CheckSquare,
  AlertTriangle,
  Calendar,
  TrendingUp
} from "lucide-react";
import Link from "next/link";

interface IntelligenceModulesProps {
  heatScore: {
    heat_score: number;
    heat_level: string;
    last_calculated_at: string;
  } | null;
  stormImpact: {
    last_storm_date: string;
    storm_type: string;
    severity: string;
    storm_risk_level: string | null;
    hail_size: number | null;
  } | null;
  insuranceSignals: {
    claim_likelihood: string;
    adjuster_mentioned: boolean;
    deductible_noted: boolean;
    claim_filed: boolean;
    acv_rcv_hints: boolean;
  };
  jobValue: {
    estimated_job_value: number | null;
    estimated_value_min: number | null;
    estimated_value_max: number | null;
    job_type: string | null;
  };
  pipelineStage: {
    id: string;
    key: string;
    label: string;
  } | null;
  tasks: Array<{
    id: string;
    title: string;
    due_at: string | null;
    completed: boolean;
  }>;
  onPipelineStageChange?: (stageId: string) => void;
}

export function IntelligenceModules({
  heatScore,
  stormImpact,
  insuranceSignals,
  jobValue,
  pipelineStage,
  tasks,
  onPipelineStageChange,
}: IntelligenceModulesProps) {
  const getHeatIcon = (level: string) => {
    if (level === "hot") return <Flame className="h-5 w-5 text-red-600" />;
    if (level === "warm") return <Flame className="h-5 w-5 text-yellow-600" />;
    return <Flame className="h-5 w-5 text-gray-400" />;
  };

  const getHeatColor = (score: number) => {
    if (score >= 70) return "text-red-600";
    if (score >= 40) return "text-yellow-600";
    return "text-gray-600";
  };

  return (
    <div className="space-y-4">
      {/* Lead Heat Score */}
      <Card className="border-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {getHeatIcon(heatScore?.heat_level || "cold")}
            <span>Lead Heat Score</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-3xl font-bold ${getHeatColor(heatScore?.heat_score || 0)}`}>
                {heatScore?.heat_score || 0}
                <span className="text-lg font-normal text-muted-foreground">/100</span>
              </div>
              <Badge 
                variant={heatScore?.heat_level === "hot" ? "destructive" : "default"}
                className="mt-2"
              >
                {heatScore?.heat_level?.toUpperCase() || "COLD"}
              </Badge>
            </div>
            {heatScore?.last_calculated_at && (
              <div className="text-xs text-muted-foreground text-right">
                Updated<br />
                {new Date(heatScore.last_calculated_at).toLocaleDateString()}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Storm Impact Box */}
      {stormImpact && (
        <Card className="border-2 border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CloudLightning className="h-5 w-5 text-blue-600" />
              <span>Storm Impact</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <div className="text-xs text-muted-foreground">Last Storm Date</div>
              <div className="font-medium">
                {new Date(stormImpact.last_storm_date).toLocaleDateString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Storm Type</div>
              <Badge variant="outline" className="capitalize">
                {stormImpact.storm_type}
              </Badge>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Severity</div>
              <Badge 
                variant={stormImpact.severity === "high" ? "destructive" : "default"}
                className="capitalize"
              >
                {stormImpact.severity}
              </Badge>
            </div>
            {stormImpact.hail_size && (
              <div>
                <div className="text-xs text-muted-foreground">Hail Size</div>
                <div className="font-medium">{stormImpact.hail_size}"</div>
              </div>
            )}
            {stormImpact.storm_risk_level && (
              <div>
                <div className="text-xs text-muted-foreground">Risk Level</div>
                <Badge variant="outline" className="capitalize">
                  {stormImpact.storm_risk_level}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Insurance Signals Box */}
      <Card className="border-2 border-purple-200 bg-purple-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-purple-600" />
            <span>Insurance Signals</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <div className="text-xs text-muted-foreground">Claim Likelihood</div>
            <Badge 
              variant={insuranceSignals.claim_likelihood === "High" ? "destructive" : "default"}
            >
              {insuranceSignals.claim_likelihood}
            </Badge>
          </div>
          <div className="space-y-1 text-sm">
            {insuranceSignals.adjuster_mentioned && (
              <div className="flex items-center gap-2 text-purple-700">
                <AlertTriangle className="h-4 w-4" />
                <span>Adjuster mentioned</span>
              </div>
            )}
            {insuranceSignals.deductible_noted && (
              <div className="flex items-center gap-2 text-purple-700">
                <DollarSign className="h-4 w-4" />
                <span>Deductible noted</span>
              </div>
            )}
            {insuranceSignals.claim_filed && (
              <div className="flex items-center gap-2 text-green-700">
                <CheckSquare className="h-4 w-4" />
                <span>Claim filed</span>
              </div>
            )}
            {insuranceSignals.acv_rcv_hints && (
              <div className="flex items-center gap-2 text-purple-700">
                <TrendingUp className="h-4 w-4" />
                <span>ACV/RCV hints detected</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Job Value Box */}
      {(jobValue.estimated_job_value || jobValue.estimated_value_min) && (
        <Card className="border-2 border-green-200 bg-green-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-5 w-5 text-green-600" />
              <span>Job Value</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobValue.estimated_value_min && jobValue.estimated_value_max ? (
              <div>
                <div className="text-xs text-muted-foreground">Estimated Range</div>
                <div className="text-xl font-bold text-green-700">
                  ${jobValue.estimated_value_min.toLocaleString()}–${jobValue.estimated_value_max.toLocaleString()}
                </div>
              </div>
            ) : jobValue.estimated_job_value ? (
              <div>
                <div className="text-xs text-muted-foreground">Estimated Value</div>
                <div className="text-xl font-bold text-green-700">
                  ${jobValue.estimated_job_value.toLocaleString()}
                </div>
              </div>
            ) : null}
            {jobValue.job_type && (
              <div>
                <div className="text-xs text-muted-foreground">Job Type</div>
                <Badge variant="outline" className="capitalize">
                  {jobValue.job_type.replace(/_/g, " ")}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pipeline Stage */}
      {pipelineStage && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-5 w-5" />
              <span>Pipeline Stage</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant="default" className="text-sm">
                {pipelineStage.label}
              </Badge>
              <Link
                href="/pipeline"
                className="text-xs text-blue-600 hover:underline"
              >
                View in pipeline →
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tasks for this Homeowner */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckSquare className="h-5 w-5" />
            <span>Tasks</span>
            <Badge variant="outline" className="ml-auto text-xs">
              {tasks.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No tasks yet
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border"
                >
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      readOnly
                      className="rounded"
                    />
                    <span className={`text-sm ${task.completed ? "line-through text-muted-foreground" : ""}`}>
                      {task.title}
                    </span>
                  </div>
                  {task.due_at && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(task.due_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))}
              {tasks.length > 5 && (
                <Link
                  href={`/tasks?contactId=${tasks[0]?.id || ""}`}
                  className="text-xs text-blue-600 hover:underline block text-center pt-2"
                >
                  View all {tasks.length} tasks →
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}





















































