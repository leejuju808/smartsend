"use client";

// Block 251700 — SmartSend Crew Issue Reporting System v1
// Job Risk Score Component
// Displays risk score based on open issues

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

interface RiskScoreData {
  score: number;
  level: string;
  issue_counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

interface JobRiskScoreProps {
  jobId: string;
}

export function JobRiskScore({ jobId }: JobRiskScoreProps) {
  const [riskData, setRiskData] = useState<RiskScoreData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRiskScore();
  }, [jobId]);

  const loadRiskScore = async () => {
    try {
      const res = await fetch(`/api/workforce/issues/job-risk/${jobId}`);
      const data = await res.json();
      if (data.error) {
        console.error("Error loading risk score:", data.error);
        return;
      }
      setRiskData(data);
    } catch (error) {
      console.error("Error loading risk score:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null;
  }

  if (!riskData || riskData.score === 0) {
    return null;
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case "CRITICAL":
        return "bg-red-100 text-red-800 border-red-300";
      case "HIGH":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "MODERATE":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "LOW":
        return "bg-gray-100 text-gray-800 border-gray-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-600" />
          <h3 className="text-sm font-semibold text-gray-900">Risk Level</h3>
        </div>
        <Link
          href={`/workforce/issues?job_id=${jobId}`}
          className="text-xs text-blue-600 hover:underline"
        >
          View Issues →
        </Link>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Risk Score:</span>
          <span
            className={`px-2 py-1 rounded text-xs font-semibold border ${getRiskColor(
              riskData.level
            )}`}
          >
            {riskData.level} (Score: {riskData.score})
          </span>
        </div>
        {(riskData.issue_counts.critical > 0 ||
          riskData.issue_counts.high > 0 ||
          riskData.issue_counts.medium > 0 ||
          riskData.issue_counts.low > 0) && (
          <div className="text-xs text-gray-500 space-y-1">
            {riskData.issue_counts.critical > 0 && (
              <div>Critical: {riskData.issue_counts.critical}</div>
            )}
            {riskData.issue_counts.high > 0 && (
              <div>High: {riskData.issue_counts.high}</div>
            )}
            {riskData.issue_counts.medium > 0 && (
              <div>Medium: {riskData.issue_counts.medium}</div>
            )}
            {riskData.issue_counts.low > 0 && (
              <div>Low: {riskData.issue_counts.low}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
























