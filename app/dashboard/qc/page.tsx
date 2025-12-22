"use client";

// Block 50000 — SmartSend Roofing QC Inspection System v1
// Supervisor QC Dashboard
// app/dashboard/qc/page.tsx

import { useEffect, useState } from "react";
import { 
  CheckCircle2, 
  Clock, 
  XCircle, 
  AlertTriangle,
  TrendingUp,
  FileCheck,
  Camera
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface QCStats {
  pending: number;
  in_review: number;
  completed: number;
  failed: number;
  re_inspection: number;
  average_score: number;
  total_inspections: number;
}

interface PendingJob {
  id: string;
  job_id: string;
  score: number;
  status: string;
  created_at: string;
  job: {
    id: string;
    title: string;
    status: string;
  };
}

export default function QCDashboardPage() {
  const [stats, setStats] = useState<QCStats | null>(null);
  const [recentPending, setRecentPending] = useState<PendingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadDashboard = async () => {
    const supabase = createClient();
    
    // Get active workspace
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get workspace (simplified - you may need to adjust based on your workspace logic)
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .limit(1)
      .single();

    if (!workspace) {
      setLoading(false);
      return;
    }

    setWorkspaceId(workspace.id);

    // Fetch dashboard stats
    const response = await fetch(`/api/qc/dashboard?workspace_id=${workspace.id}`);
    if (response.ok) {
      const data = await response.json();
      setStats(data.stats);
      setRecentPending(data.recent_pending || []);
    }

    setLoading(false);
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: { label: "Pending", color: "bg-yellow-500/20 text-yellow-500 border-yellow-500/50" },
      in_review: { label: "In Review", color: "bg-blue-500/20 text-blue-500 border-blue-500/50" },
      completed: { label: "Completed", color: "bg-green-500/20 text-green-500 border-green-500/50" },
      failed: { label: "Failed", color: "bg-red-500/20 text-red-500 border-red-500/50" },
      re_inspection: { label: "Re-Inspection", color: "bg-orange-500/20 text-orange-500 border-orange-500/50" },
    };
    
    const badge = badges[status as keyof typeof badges] || badges.pending;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading QC Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">QC Inspection Dashboard</h1>
          <p className="text-gray-400">
            Monitor quality control inspections, track scores, and manage QC workflow
          </p>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Pending QC</span>
                <Clock className="w-5 h-5 text-yellow-500" />
              </div>
              <p className="text-3xl font-bold">{stats.pending}</p>
              <p className="text-xs text-gray-500 mt-1">Awaiting supervisor</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">In Review</span>
                <FileCheck className="w-5 h-5 text-blue-500" />
              </div>
              <p className="text-3xl font-bold">{stats.in_review}</p>
              <p className="text-xs text-gray-500 mt-1">Active inspections</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Completed</span>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <p className="text-3xl font-bold">{stats.completed}</p>
              <p className="text-xs text-gray-500 mt-1">Passed QC</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Average Score</span>
                <TrendingUp className="w-5 h-5 text-yellow-500" />
              </div>
              <p className="text-3xl font-bold">{stats.average_score.toFixed(1)}</p>
              <p className="text-xs text-gray-500 mt-1">Out of 100</p>
            </div>
          </div>
        )}

        {/* Secondary Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Failed</span>
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
              <p className="text-3xl font-bold">{stats.failed}</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Re-Inspection</span>
                <AlertTriangle className="w-5 h-5 text-orange-500" />
              </div>
              <p className="text-3xl font-bold">{stats.re_inspection}</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Total Inspections</span>
                <FileCheck className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-3xl font-bold">{stats.total_inspections}</p>
            </div>
          </div>
        )}

        {/* Recent Pending Jobs */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Jobs Needing QC Attention</h2>
            <Link 
              href="/dashboard/qc/inspections"
              className="text-yellow-500 hover:text-yellow-400 text-sm"
            >
              View All →
            </Link>
          </div>

          {recentPending.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No jobs currently need QC attention</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentPending.map((item) => (
                <Link
                  key={item.id}
                  href={`/dashboard/qc/inspections/${item.id}`}
                  className="block bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-yellow-500/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium">{item.job?.title || "Untitled Job"}</h3>
                        {getStatusBadge(item.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        <span>Score: {item.score.toFixed(1)}</span>
                        <span>•</span>
                        <span>{new Date(item.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-yellow-500 text-sm">Review →</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
































