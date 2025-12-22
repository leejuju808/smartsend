"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { createClientComponentClient } from "@/lib/supabase";
import Link from "next/link";
import { ArrowLeft, TrendingDown, TrendingUp } from "lucide-react";

type JobProfitability = {
  jobId: string;
  jobTitle: string;
  status: string;
  revenue: number;
  costs: {
    materials: number;
    labor: number;
    other: number;
    total: number;
  };
  profit: {
    gross: number;
    marginPct: number;
    changeOrders: number;
    supplementProfit: number;
  };
  dates: {
    scheduledStart: string | null;
    scheduledEnd: string | null;
  };
};

export default function JobProfitabilityPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobProfitability[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const activeWorkspace = typeof window !== "undefined" 
          ? localStorage.getItem('active_workspace') 
          : null;
        
        if (activeWorkspace) {
          setWorkspaceId(activeWorkspace);
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: workspace } = await supabase
              .from('workspace_members')
              .select('workspace_id')
              .eq('user_id', user.id)
              .limit(1)
              .maybeSingle();
            
            if (workspace) {
              setWorkspaceId(workspace.workspace_id);
            }
          }
        }
      } catch (error) {
        console.error('Error loading workspace:', error);
        setLoading(false);
      }
    };

    loadWorkspace();
  }, [supabase]);

  useEffect(() => {
    if (!workspaceId) return;

    const loadJobs = async () => {
      try {
        // Get all jobs with profitability data
        const { data: profitabilityData } = await supabase
          .from("job_profitability")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("revenue", { ascending: false })
          .limit(50);

        if (!profitabilityData) {
          setLoading(false);
          return;
        }

        // Fetch detailed profitability for each job
        const jobsData = await Promise.all(
          profitabilityData.map(async (job) => {
            const res = await fetch(
              `/api/analytics/ceo-dashboard/jobs/${job.job_id}/profit?wid=${workspaceId}`
            );
            if (res.ok) {
              return await res.json();
            }
            return null;
          })
        );

        setJobs(jobsData.filter(Boolean));
      } catch (error) {
        console.error("Error loading jobs:", error);
      } finally {
        setLoading(false);
      }
    };

    loadJobs();
  }, [workspaceId]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getMarginColor = (margin: number) => {
    if (margin >= 30) return "text-green-600";
    if (margin >= 15) return "text-yellow-600";
    return "text-red-600";
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm">Loading job profitability...</div>
      </div>
    );
  }

  const totalRevenue = jobs.reduce((sum, job) => sum + job.revenue, 0);
  const totalCosts = jobs.reduce((sum, job) => sum + job.costs.total, 0);
  const totalProfit = jobs.reduce((sum, job) => sum + job.profit.gross, 0);
  const avgMargin = jobs.length > 0 
    ? jobs.reduce((sum, job) => sum + job.profit.marginPct, 0) / jobs.length 
    : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/analytics/ceo-command-center">
            <ArrowLeft className="h-5 w-5 cursor-pointer" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Job Profitability Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              See which jobs are profitable and where you're losing margin
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">{jobs.length} jobs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Costs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalCosts)}</div>
            <p className="text-xs text-muted-foreground mt-1">Materials + Labor + Other</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalProfit)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {((totalProfit / totalRevenue) * 100).toFixed(1)}% margin
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Average Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getMarginColor(avgMargin)}`}>
              {avgMargin.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Per job average</p>
          </CardContent>
        </Card>
      </div>

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Job Profitability Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Job</th>
                  <th className="text-right p-2">Revenue</th>
                  <th className="text-right p-2">Materials</th>
                  <th className="text-right p-2">Labor</th>
                  <th className="text-right p-2">Other</th>
                  <th className="text-right p-2">Total Cost</th>
                  <th className="text-right p-2">Gross Profit</th>
                  <th className="text-right p-2">Margin %</th>
                  <th className="text-left p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.jobId} className="border-b hover:bg-muted/50">
                    <td className="p-2">
                      <div className="font-medium">{job.jobTitle || "Untitled"}</div>
                      <div className="text-xs text-muted-foreground">{job.jobId.slice(0, 8)}</div>
                    </td>
                    <td className="text-right p-2 font-medium">
                      {formatCurrency(job.revenue)}
                    </td>
                    <td className="text-right p-2">{formatCurrency(job.costs.materials)}</td>
                    <td className="text-right p-2">{formatCurrency(job.costs.labor)}</td>
                    <td className="text-right p-2">{formatCurrency(job.costs.other)}</td>
                    <td className="text-right p-2">{formatCurrency(job.costs.total)}</td>
                    <td className={`text-right p-2 font-medium ${job.profit.gross >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(job.profit.gross)}
                    </td>
                    <td className={`text-right p-2 font-medium ${getMarginColor(job.profit.marginPct)}`}>
                      {job.profit.marginPct.toFixed(1)}%
                      {job.profit.marginPct >= 30 ? (
                        <TrendingUp className="h-3 w-3 inline ml-1" />
                      ) : job.profit.marginPct < 15 ? (
                        <TrendingDown className="h-3 w-3 inline ml-1" />
                      ) : null}
                    </td>
                    <td className="p-2">
                      <span className="px-2 py-1 rounded text-xs bg-muted">
                        {job.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

























