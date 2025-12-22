// Block 254100 — Operations AI Director Dashboard
// Shows AI predictions, recommendations, and alerts

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/Button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Clock, Users, Package, Shield, Cloud, TrendingDown, CheckCircle, XCircle } from 'lucide-react';

interface DashboardData {
  summary: {
    predicted_delays: number;
    crew_assignment_issues: number;
    material_shortages: number;
    safety_risks: number;
    weather_conflicts: number;
    bottlenecks: number;
  };
  predictions: Array<{
    id: string;
    job_id: string;
    prediction_type: string;
    confidence: number;
    message: string;
    prediction_data: any;
    created_at: string;
  }>;
  recommendations: Array<{
    id: string;
    job_id: string;
    recommendation_type: string;
    priority: string;
    recommended_value: any;
    created_at: string;
  }>;
  alerts: Array<{
    id: string;
    job_id: string;
    alert_type: string;
    severity: string;
    title: string;
    message: string;
    created_at: string;
  }>;
}

interface OperationsAIDirectorDashboardProps {
  workspaceId: string;
}

export function OperationsAIDirectorDashboard({ workspaceId }: OperationsAIDirectorDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, [workspaceId]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/operations-ai/dashboard?workspaceId=${workspaceId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const dashboardData = await response.json();
      setData(dashboardData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getPredictionIcon = (type: string) => {
    switch (type) {
      case 'delay':
        return <Clock className="h-4 w-4" />;
      case 'crew_mismatch':
        return <Users className="h-4 w-4" />;
      case 'material_shortage':
        return <Package className="h-4 w-4" />;
      case 'safety_risk':
        return <Shield className="h-4 w-4" />;
      case 'weather_impact':
        return <Cloud className="h-4 w-4" />;
      case 'bottleneck':
        return <TrendingDown className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'info':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'low':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center">Loading AI Director Report...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">AI Director Report</h1>
        <p className="text-muted-foreground mt-2">
          Today's AI predictions, recommendations, and alerts
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Predicted Delays</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.predicted_delays}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Crew Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.crew_assignment_issues}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Material Shortages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.material_shortages}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Safety Risks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.safety_risks}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Weather Conflicts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.weather_conflicts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Bottlenecks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.bottlenecks}</div>
          </CardContent>
        </Card>
      </div>

      {/* AI Recommendations */}
      {data.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>AI Recommendations</CardTitle>
            <CardDescription>
              Actionable recommendations to optimize operations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.recommendations.map((rec) => (
              <div
                key={rec.id}
                className="flex items-start justify-between p-4 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={getPriorityColor(rec.priority)}>
                      {rec.priority}
                    </Badge>
                    <span className="text-sm font-medium capitalize">
                      {rec.recommendation_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {rec.recommendation_type === 'crew_assignment' && (
                    <div className="text-sm text-muted-foreground">
                      <p>
                        Recommended Crew: <strong>{rec.recommended_value?.recommended_crew_name}</strong> (Score: {rec.recommended_value?.score})
                      </p>
                      <p className="mt-1">{rec.recommended_value?.reasoning}</p>
                    </div>
                  )}
                  {rec.recommendation_type === 'material_order' && (
                    <div className="text-sm text-muted-foreground">
                      <p>
                        Order <strong>{rec.recommended_value?.quantity} {rec.recommended_value?.unit}</strong> of {rec.recommended_value?.material_name}
                      </p>
                      <p className="mt-1">{rec.recommended_value?.reasoning}</p>
                    </div>
                  )}
                  {rec.recommendation_type === 'schedule_shift' && (
                    <div className="text-sm text-muted-foreground">
                      <p>
                        Optimal Schedule: Start at <strong>{rec.recommended_value?.recommended_start_time}</strong>
                      </p>
                      <p className="mt-1">Predicted Completion: {rec.recommended_value?.predicted_completion}</p>
                      <p className="mt-1">Weather Risk: {rec.recommended_value?.weather_risk}</p>
                    </div>
                  )}
                  {rec.recommendation_type === 'bottleneck_resolution' && (
                    <div className="text-sm text-muted-foreground">
                      <p>{rec.recommended_value?.recommended_action}</p>
                      <p className="mt-1">
                        Predicted time saved: <strong>{rec.recommended_value?.predicted_time_saved} hours</strong>
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline">
                    Approve
                  </Button>
                  <Button size="sm" variant="ghost">
                    Dismiss
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Preventative Alerts */}
      {data.alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preventative Alerts</CardTitle>
            <CardDescription>
              Warnings before problems happen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.alerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-lg border p-4 ${getSeverityColor(alert.severity)}`}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5" />
                  <div className="flex-1">
                    <AlertTitle>{alert.title}</AlertTitle>
                    <AlertDescription>{alert.message}</AlertDescription>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Predictions */}
      {data.predictions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>AI Predictions</CardTitle>
            <CardDescription>
              Predicted issues and delays
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.predictions.map((pred) => (
              <div
                key={pred.id}
                className="flex items-start gap-3 p-3 border rounded-lg"
              >
                <div className="mt-1">
                  {getPredictionIcon(pred.prediction_type)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="capitalize">
                      {pred.prediction_type.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(pred.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="text-sm">{pred.message}</p>
                  {pred.prediction_data?.reasons && (
                    <ul className="mt-2 text-xs text-muted-foreground list-disc list-inside">
                      {pred.prediction_data.reasons.map((reason: string, idx: number) => (
                        <li key={idx}>{reason}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <Button size="sm" variant="ghost">
                  Resolve
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.predictions.length === 0 && data.recommendations.length === 0 && data.alerts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <p className="text-lg font-medium">All Clear!</p>
            <p className="text-sm text-muted-foreground mt-2">
              No predictions, recommendations, or alerts at this time.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}






















