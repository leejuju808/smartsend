"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function WorkloadForecastPage() {
  const supabase = createClientComponentClient();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const fetchWorkspace = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: workspace } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (workspace?.workspace_id) {
          setWorkspaceId(workspace.workspace_id);
        }
      } catch (error) {
        console.error("Error fetching workspace:", error);
      }
    };

    fetchWorkspace();
  }, [supabase]);

  useEffect(() => {
    if (workspaceId) {
      loadForecast();
    }
  }, [workspaceId]);

  const loadForecast = async () => {
    if (!workspaceId) return;

    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/schedule/forecast`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            weeks_ahead: 4,
            forecast_type: "weekly",
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setForecasts(data.forecasts || []);
        setSummary(data.summary || null);
      } else {
        const error = await response.json();
        console.error("Error loading forecast:", error);
      }
    } catch (error) {
      console.error("Error loading forecast:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateForecast = async () => {
    if (!workspaceId) return;

    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/schedule/forecast`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            weeks_ahead: 4,
            forecast_type: "weekly",
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setForecasts(data.forecasts || []);
        setSummary(data.summary || null);
      }
    } catch (error) {
      console.error("Error generating forecast:", error);
    } finally {
      setGenerating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "critical":
        return <Badge className="bg-red-500">Critical</Badge>;
      case "warning":
        return <Badge className="bg-yellow-500">Warning</Badge>;
      case "caution":
        return <Badge className="bg-orange-500">Caution</Badge>;
      default:
        return <Badge className="bg-green-500">Healthy</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "critical":
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "caution":
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      default:
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading workload forecast...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workload Forecast</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Predictive workload planning and capacity analysis
          </p>
        </div>
        <Button onClick={generateForecast} disabled={generating}>
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Calendar className="h-4 w-4 mr-2" />
              Refresh Forecast
            </>
          )}
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Weeks Forecasted
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total_weeks}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Weeks with Shortage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {summary.weeks_with_shortage}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Critical Weeks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {summary.weeks_critical}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Utilization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.round(summary.average_utilization)}%
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Weekly Forecasts */}
      <div className="space-y-4">
        {forecasts.map((forecast, index) => (
          <Card key={index}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(forecast.status)}
                  <div>
                    <CardTitle>
                      Week of {format(new Date(forecast.week_start), "MMM d")} -{" "}
                      {format(new Date(forecast.week_end), "MMM d, yyyy")}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {forecast.jobs_scheduled} jobs scheduled, {forecast.jobs_pending} pending
                    </p>
                  </div>
                </div>
                {getStatusBadge(forecast.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">Hours Required</p>
                  <p className="text-2xl font-bold">{forecast.total_hours_required.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Hours Available</p>
                  <p className="text-2xl font-bold">{forecast.total_hours_available.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Shortage</p>
                  <p className="text-2xl font-bold text-red-600">
                    {forecast.shortage > 0 ? (
                      <>
                        <TrendingUp className="inline h-5 w-5 mr-1" />
                        {forecast.shortage.toFixed(1)}
                      </>
                    ) : (
                      <>
                        <TrendingDown className="inline h-5 w-5 mr-1" />
                        {forecast.surplus.toFixed(1)}
                      </>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Utilization</p>
                  <p className="text-2xl font-bold">
                    {forecast.utilization_percentage.toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Recommendations */}
              {forecast.recommendations && forecast.recommendations.length > 0 && (
                <Alert className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <strong>Recommendations:</strong>
                      <ul className="list-disc list-inside text-sm space-y-1">
                        {forecast.recommendations.map((rec: string, i: number) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Crew Breakdown */}
              {forecast.crew_breakdown && Object.keys(forecast.crew_breakdown).length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2">Crew Breakdown:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {Object.values(forecast.crew_breakdown).map((crew: any, i: number) => (
                      <div
                        key={i}
                        className="p-2 border rounded text-sm"
                      >
                        <div className="font-medium">{crew.crew_name}</div>
                        <div className="text-muted-foreground">
                          {crew.hours_required.toFixed(1)}h / {crew.hours_available.toFixed(1)}h
                          {" "}
                          ({crew.utilization_percentage.toFixed(1)}%)
                        </div>
                        {crew.shortage > 0 && (
                          <div className="text-red-600 text-xs mt-1">
                            Shortage: {crew.shortage.toFixed(1)}h
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {forecasts.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No forecast data available. Click "Refresh Forecast" to generate.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
































