// Block 63000 — SmartSend Roofing Risk Detection + Warranty Liability AI System v1
// Full Risk Dashboard Page

"use client";

import { useEffect, useState } from "react";
import { RiskDashboard } from "@/components/dashboard/RiskDashboard";
import { AlertTriangle, Shield, TrendingUp, BarChart3 } from "lucide-react";
import Link from "next/link";

interface RiskAssessment {
  id: string;
  job_id: string;
  risk_score: number;
  risk_factors: any;
  warranty_risk: any;
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

export default function RiskDashboardPage() {
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  useEffect(() => {
    loadRiskData();
  }, []);

  const loadRiskData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/risk/dashboard");
      if (res.ok) {
        const data = await res.json();
        setAssessments(data.assessments || []);
        setAlerts(data.alerts || []);
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
    if (score >= 80) return "text-red-400 bg-red-500/20 border-red-500/40";
    if (score >= 60) return "text-orange-400 bg-orange-500/20 border-orange-500/40";
    if (score >= 40) return "text-yellow-400 bg-yellow-500/20 border-yellow-500/40";
    if (score >= 20) return "text-blue-400 bg-blue-500/20 border-blue-500/40";
    return "text-green-400 bg-green-500/20 border-green-500/40";
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-400">Loading risk dashboard...</div>
      </div>
    );
  }

  const criticalAlerts = alerts.filter(a => !a.resolved && (a.severity === "critical" || a.severity === "high"));
  const sortedAssessments = [...assessments].sort((a, b) => b.risk_score - a.risk_score);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-amber-400" />
            Risk Detection & Warranty Protection
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            AI-powered risk detection • Prevent callbacks • Reduce warranty claims
          </p>
        </div>
      </div>

      {/* Critical Alerts Panel */}
      {criticalAlerts.length > 0 && (
        <div className="bg-gradient-to-r from-red-500/20 via-red-400/10 to-transparent border border-red-500/40 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h2 className="text-lg font-semibold text-red-300">
              Critical Risk Alerts ({criticalAlerts.length})
            </h2>
          </div>
          <div className="space-y-3">
            {criticalAlerts.map((alert) => (
              <div
                key={alert.id}
                className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-white">
                        {alert.job?.title || `Job #${alert.job_id.slice(0, 8)}`}
                      </span>
                      <span className="text-xs px-2 py-1 rounded bg-red-500/30 text-red-200 uppercase">
                        {alert.severity}
                      </span>
                    </div>
                    <div className="text-sm text-zinc-300">{alert.message}</div>
                    <div className="text-xs text-zinc-400 mt-2">
                      {new Date(alert.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/jobs/${alert.job_id}`}
                    className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded text-sm transition-colors"
                  >
                    View Job
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Score Table */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            Risk Score Table
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400">Job</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400">Crew</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-zinc-400">Risk Score</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-zinc-400">Warranty Risk</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400">Warnings</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedAssessments.map((assessment) => {
                const riskFactors = assessment.risk_factors || {};
                const totalWarnings = 
                  (riskFactors.installation_risks?.length || 0) +
                  (riskFactors.material_risks?.length || 0) +
                  (riskFactors.workmanship_risks?.length || 0) +
                  (riskFactors.environmental_risks?.length || 0);

                return (
                  <tr
                    key={assessment.id}
                    className="border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="text-sm font-medium text-white">
                        {assessment.job?.title || `Job #${assessment.job_id.slice(0, 8)}`}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-zinc-400">
                        {assessment.job?.crew_name || "—"}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${getRiskColor(assessment.risk_score)}`}>
                        <span className="text-lg font-bold">{assessment.risk_score}</span>
                        <span className="text-xs">
                          {getRiskLevelLabel(assessment.risk_score)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="text-sm font-medium text-amber-400">
                        {assessment.warranty_risk?.probability || 0}%
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-zinc-400">
                        {totalWarnings} risk factors
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Link
                        href={`/dashboard/jobs/${assessment.job_id}`}
                        className="text-sm text-amber-400 hover:text-amber-300"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sortedAssessments.length === 0 && (
            <div className="text-center py-12 text-zinc-400">
              No risk assessments found. Run risk analysis on completed jobs to see data here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}




























