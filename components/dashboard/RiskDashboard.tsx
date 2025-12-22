// Block 63000 — SmartSend Roofing Risk Detection + Warranty Liability AI System v1
// Risk Dashboard Component
// Shows risk scores, alerts, and warranty exposure

"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Shield, TrendingUp, AlertCircle } from "lucide-react";
import Link from "next/link";

interface RiskAssessment {
  id: string;
  job_id: string;
  risk_score: number;
  risk_factors: {
    installation_risks: string[];
    material_risks: string[];
    workmanship_risks: string[];
    environmental_risks: string[];
  };
  warranty_risk: {
    probability: number;
    predicted_claim_types: string[];
    estimated_cost_range: { min: number; max: number };
  };
  created_at: string;
  job?: {
    id: string;
    title: string;
    crew_name: string;
  };
}

interface RiskAlert {
  id: string;
  job_id: string;
  alert_type: string;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  resolved: boolean;
  created_at: string;
  job?: {
    id: string;
    title: string;
  };
}

interface WarrantyExposure {
  total_predicted_liability: number;
  high_risk_jobs_count: number;
  medium_risk_jobs_count: number;
  low_risk_jobs_count: number;
  predicted_claims_next_6_months: number;
}

export function RiskDashboard() {
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [exposure, setExposure] = useState<WarrantyExposure | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRiskData();
  }, []);

  const loadRiskData = async () => {
    try {
      setLoading(true);
      
      // Get workspace ID from cookie or API
      let workspaceId: string | null = null;
      try {
        const wsRes = await fetch("/api/me/workspace");
        if (wsRes.ok) {
          const wsData = await wsRes.json();
          workspaceId = wsData.workspaceId;
        }
      } catch (e) {
        // Fallback: try to get from cookie
        const cookies = document.cookie.split("; ");
        const wsCookie = cookies.find(c => c.startsWith("active_ws="));
        if (wsCookie) {
          workspaceId = wsCookie.split("=")[1];
        }
      }
      
      // Load risk assessments
      const url = workspaceId 
        ? `/api/risk/dashboard?workspace_id=${workspaceId}`
        : "/api/risk/dashboard";
      const assessmentsRes = await fetch(url);
      if (assessmentsRes.ok) {
        const data = await assessmentsRes.json();
        setAssessments(data.assessments || []);
        setAlerts(data.alerts || []);
        setExposure(data.exposure || null);
      }
    } catch (error) {
      console.error("Error loading risk data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskLevelLabel = (score: number): string => {
    if (score >= 80) return "VERY HIGH";
    if (score >= 60) return "HIGH";
    if (score >= 40) return "MEDIUM";
    if (score >= 20) return "SLIGHT CAUTION";
    return "LOW";
  };

  const getRiskColor = (score: number): string => {
    if (score >= 80) return "text-red-400";
    if (score >= 60) return "text-orange-400";
    if (score >= 40) return "text-yellow-400";
    if (score >= 20) return "text-blue-400";
    return "text-green-400";
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case "critical":
        return "bg-red-500/20 text-red-300 border-red-500/40";
      case "high":
        return "bg-orange-500/20 text-orange-300 border-orange-500/40";
      case "medium":
        return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
      default:
        return "bg-blue-500/20 text-blue-300 border-blue-500/40";
    }
  };

  if (loading) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="text-sm text-zinc-400">Loading risk data...</div>
      </div>
    );
  }

  const criticalAlerts = alerts.filter(a => !a.resolved && (a.severity === "critical" || a.severity === "high"));
  const highRiskJobs = assessments.filter(a => a.risk_score >= 60);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            Risk Detection & Warranty Protection
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            AI-powered risk detection • Prevent callbacks • Reduce warranty claims
          </p>
        </div>
        <Link
          href="/dashboard/risk"
          className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-sm font-medium transition-colors border border-amber-500/40"
        >
          View Full Dashboard
        </Link>
      </div>

      {/* Critical Risk Alerts Panel */}
      {criticalAlerts.length > 0 && (
        <div className="bg-gradient-to-r from-red-500/20 via-red-400/10 to-transparent border border-red-500/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h3 className="text-sm font-semibold text-red-300">
              Critical Risk Alerts ({criticalAlerts.length})
            </h3>
          </div>
          <div className="space-y-2">
            {criticalAlerts.slice(0, 3).map((alert) => (
              <div
                key={alert.id}
                className={`p-3 rounded-lg border ${getSeverityColor(alert.severity)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {alert.job?.title || `Job #${alert.job_id.slice(0, 8)}`}
                    </div>
                    <div className="text-xs mt-1 opacity-90">{alert.message}</div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-black/20 uppercase">
                    {alert.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Score Table */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-amber-400" />
          High-Risk Jobs
        </h3>
        {highRiskJobs.length > 0 ? (
          <div className="space-y-2">
            {highRiskJobs.slice(0, 5).map((assessment) => (
              <div
                key={assessment.id}
                className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">
                    {assessment.job?.title || `Job #${assessment.job_id.slice(0, 8)}`}
                  </div>
                  <div className="text-xs text-zinc-400 mt-1">
                    {assessment.job?.crew_name || "No crew assigned"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className={`text-lg font-bold ${getRiskColor(assessment.risk_score)}`}>
                      {assessment.risk_score}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {getRiskLevelLabel(assessment.risk_score)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-zinc-400">Warranty Risk</div>
                    <div className="text-sm font-medium text-amber-400">
                      {assessment.warranty_risk?.probability || 0}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-zinc-400 py-4 text-center">
            No high-risk jobs detected
          </div>
        )}
      </div>

      {/* Warranty Exposure Summary */}
      {exposure && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            Warranty Exposure Summary
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-zinc-400">Total Predicted Liability</div>
              <div className="text-lg font-bold text-amber-400 mt-1">
                ${exposure.total_predicted_liability?.toLocaleString() || "0"}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-400">High-Risk Jobs</div>
              <div className="text-lg font-bold text-red-400 mt-1">
                {exposure.high_risk_jobs_count || 0}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-400">Predicted Claims (6mo)</div>
              <div className="text-lg font-bold text-orange-400 mt-1">
                {exposure.predicted_claims_next_6_months || 0}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-400">Medium-Risk Jobs</div>
              <div className="text-lg font-bold text-yellow-400 mt-1">
                {exposure.medium_risk_jobs_count || 0}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




























