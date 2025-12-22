"use client";

import * as React from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Clock, AlertTriangle, CheckCircle2, Navigation } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

type JobDashboardData = {
  job_id: string;
  job_title: string;
  address: string;
  crew_id: string;
  crew_name: string;
  crew_gps_lat: number;
  crew_gps_lng: number;
  crew_status: "en_route" | "on_site" | "finished";
  progress_percent: number;
  current_status: string;
  predicted_finish_time: string | null;
  punchlist_open_count: number;
  punchlist_critical_count: number;
  material_shortages: string[];
  risk_flags: string[];
  next_crew_availability: string | null;
};

type PMDashboardProps = {
  workspaceId: string;
  date?: string;
};

export function PMControlCenterDashboard({
  workspaceId,
  date,
}: PMDashboardProps) {
  const supabase = React.useMemo(() => createClient(), []);
  const { push: toast } = useToast();

  const [jobs, setJobs] = React.useState<JobDashboardData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [stats, setStats] = React.useState({
    total_jobs: 0,
    jobs_on_site: 0,
    jobs_en_route: 0,
    jobs_finished: 0,
  });

  const selectedDate = date || new Date().toISOString().split("T")[0];

  const fetchDashboardData = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/field-ops/pm-dashboard?workspace_id=${workspaceId}&date=${selectedDate}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch dashboard data");
      }

      const data = await response.json();
      setJobs(data.jobs || []);
      setStats({
        total_jobs: data.total_jobs || 0,
        jobs_on_site: data.jobs_on_site || 0,
        jobs_en_route: data.jobs_en_route || 0,
        jobs_finished: data.jobs_finished || 0,
      });
    } catch (error: any) {
      console.error("Error fetching dashboard data:", error);
      toast({
        type: "error",
        title: "Error",
        description: error.message || "Failed to load dashboard data",
      });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, selectedDate, toast]);

  React.useEffect(() => {
    fetchDashboardData();
    // Refresh every 60 seconds
    const interval = setInterval(fetchDashboardData, 60000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "on_site":
        return <Badge className="bg-green-500">On Site</Badge>;
      case "en_route":
        return <Badge className="bg-blue-500">En Route</Badge>;
      case "finished":
        return <Badge className="bg-gray-500">Finished</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getProgressColor = (percent: number) => {
    if (percent >= 75) return "bg-green-500";
    if (percent >= 50) return "bg-yellow-500";
    if (percent >= 25) return "bg-orange-500";
    return "bg-red-500";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Field Operations Command Center</h1>
          <p className="text-muted-foreground mt-1">
            Real-time visibility into all field operations
          </p>
        </div>
        <Button onClick={fetchDashboardData} variant="outline">
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_jobs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">On Site</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.jobs_on_site}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">En Route</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats.jobs_en_route}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Finished</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">
              {stats.jobs_finished}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Active Jobs - {new Date(selectedDate).toLocaleDateString()}</CardTitle>
          <CardDescription>
            Real-time status of all jobs in progress
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No active jobs for this date
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Crew</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Current Stage</TableHead>
                  <TableHead>Punchlist</TableHead>
                  <TableHead>Risks</TableHead>
                  <TableHead>GPS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.job_id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{job.job_title}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {job.address}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{job.crew_name || "Unassigned"}</div>
                    </TableCell>
                    <TableCell>{getStatusBadge(job.crew_status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${getProgressColor(
                              job.progress_percent
                            )}`}
                            style={{ width: `${job.progress_percent}%` }}
                          />
                        </div>
                        <span className="text-sm">{job.progress_percent}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {job.current_status || "Not started"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {job.punchlist_open_count > 0 ? (
                          <>
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                            <span className="text-sm">
                              {job.punchlist_open_count} open
                            </span>
                            {job.punchlist_critical_count > 0 && (
                              <Badge variant="destructive" className="ml-1">
                                {job.punchlist_critical_count} critical
                              </Badge>
                            )}
                          </>
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {job.risk_flags && job.risk_flags.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {job.risk_flags.map((flag, idx) => (
                            <Badge key={idx} variant="destructive" className="text-xs">
                              {flag}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {job.crew_gps_lat && job.crew_gps_lng ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            window.open(
                              `https://www.google.com/maps?q=${job.crew_gps_lat},${job.crew_gps_lng}`,
                              "_blank"
                            );
                          }}
                        >
                          <Navigation className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">No GPS</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}





















