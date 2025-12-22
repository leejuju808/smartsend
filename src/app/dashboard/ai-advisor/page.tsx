'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Brain, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Sparkles,
  Mail,
  Users,
  DollarSign,
  Activity,
  Zap,
  ArrowRight,
  Clock,
  AlertCircle
} from 'lucide-react';
import { createClientComponentClient } from '@/lib/supabase';

interface Insight {
  id: string;
  insight_type: string;
  category: string;
  title: string;
  description: string;
  priority: string;
  context: Record<string, any>;
  metrics: Record<string, any>;
  created_at: string;
}

interface Recommendation {
  id: string;
  action_type: string;
  title: string;
  description: string;
  priority_score: number;
  action_context: Record<string, any>;
  estimated_impact: Record<string, any>;
  created_at: string;
}

interface Alert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  context: Record<string, any>;
  quick_fix_actions: Array<Record<string, any>>;
  created_at: string;
}

export default function AIAdvisorPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadAdvisorData();
  }, []);

  const loadAdvisorData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/ai-advisor');
      const data = await response.json();
      
      if (data.insights) setInsights(data.insights);
      if (data.recommendations) setRecommendations(data.recommendations);
      if (data.alerts) setAlerts(data.alerts);
      if (data.summary) setSummary(data.summary);
    } catch (error) {
      console.error('Error loading AI Advisor data:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshInsights = async () => {
    try {
      setRefreshing(true);
      const response = await fetch('/api/ai-advisor?refresh=true');
      const data = await response.json();
      
      if (data.insights) setInsights(data.insights);
      if (data.recommendations) setRecommendations(data.recommendations);
      if (data.alerts) setAlerts(data.alerts);
      if (data.summary) setSummary(data.summary);
    } catch (error) {
      console.error('Error refreshing insights:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const applyRecommendation = async (recommendationId: string) => {
    try {
      const response = await fetch('/api/ai-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply_recommendation',
          entity_type: 'recommendation',
          entity_id: recommendationId,
        }),
      });

      if (response.ok) {
        // Remove from list
        setRecommendations(recommendations.filter(r => r.id !== recommendationId));
        // Reload data
        await loadAdvisorData();
      }
    } catch (error) {
      console.error('Error applying recommendation:', error);
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const response = await fetch('/api/ai-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'acknowledge_alert',
          entity_type: 'alert',
          entity_id: alertId,
        }),
      });

      if (response.ok) {
        setAlerts(alerts.filter(a => a.id !== alertId));
      }
    } catch (error) {
      console.error('Error acknowledging alert:', error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-orange-600" />;
      default: return <Activity className="h-5 w-5 text-blue-600" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Brain className="h-12 w-12 text-blue-600 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading AI Advisor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Brain className="h-8 w-8 text-blue-600" />
            AI Advisor
          </h1>
          <p className="text-gray-600 mt-1">Workspace-level intelligence and recommendations</p>
        </div>
        <Button onClick={refreshInsights} disabled={refreshing} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh Insights
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Insights</p>
                  <p className="text-2xl font-bold">{summary.insights.total}</p>
                </div>
                <Sparkles className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Recommendations</p>
                  <p className="text-2xl font-bold">{summary.recommendations.total}</p>
                </div>
                <Zap className="h-8 w-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Active Alerts</p>
                  <p className="text-2xl font-bold">{summary.alerts.total}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Critical Issues</p>
                  <p className="text-2xl font-bold text-red-600">{summary.alerts.critical}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* High-Risk Alerts */}
      {alerts.filter(a => a.severity === 'critical').length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-900">
              <AlertCircle className="h-5 w-5" />
              Critical Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts
              .filter(a => a.severity === 'critical')
              .map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start justify-between p-4 bg-white rounded-lg border border-red-200"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getSeverityIcon(alert.severity)}
                      <h3 className="font-semibold text-gray-900">{alert.title}</h3>
                    </div>
                    <p className="text-sm text-gray-600">{alert.message}</p>
                    {alert.quick_fix_actions && alert.quick_fix_actions.length > 0 && (
                      <div className="flex gap-2 mt-3">
                        {alert.quick_fix_actions.map((action: any, idx: number) => (
                          <Button
                            key={idx}
                            size="sm"
                            variant="outline"
                            className="text-xs"
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => acknowledgeAlert(alert.id)}
                  >
                    Dismiss
                  </Button>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Today's Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Today's Insights</CardTitle>
          <CardDescription>AI-generated insights across your workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {insights.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No insights available. Click "Refresh Insights" to generate.</p>
            ) : (
              insights.map((insight) => (
                <div
                  key={insight.id}
                  className="flex items-start gap-4 p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-shrink-0">
                    {insight.insight_type === 'deliverability' && <Mail className="h-5 w-5 text-blue-600" />}
                    {insight.insight_type === 'sequence_performance' && <Activity className="h-5 w-5 text-purple-600" />}
                    {insight.insight_type === 'revenue' && <DollarSign className="h-5 w-5 text-green-600" />}
                    {insight.insight_type === 'icp_drift' && <Users className="h-5 w-5 text-orange-600" />}
                    {insight.insight_type === 'sdr_coaching' && <Users className="h-5 w-5 text-indigo-600" />}
                    {!['deliverability', 'sequence_performance', 'revenue', 'icp_drift', 'sdr_coaching'].includes(insight.insight_type) && (
                      <Brain className="h-5 w-5 text-gray-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{insight.title}</h3>
                      <Badge className={getPriorityColor(insight.priority)}>
                        {insight.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{insight.description}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="capitalize">{insight.category}</span>
                      <span>•</span>
                      <span>{new Date(insight.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Next Best Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-600" />
            Next Best Actions
          </CardTitle>
          <CardDescription>Prioritized actions you should take today</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recommendations.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No recommendations available.</p>
            ) : (
              recommendations
                .sort((a, b) => b.priority_score - a.priority_score)
                .map((rec) => (
                  <div
                    key={rec.id}
                    className="flex items-start justify-between p-4 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{rec.title}</h3>
                        <Badge variant="outline" className="text-xs">
                          Score: {rec.priority_score}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{rec.description}</p>
                      {rec.estimated_impact && Object.keys(rec.estimated_impact).length > 0 && (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <TrendingUp className="h-3 w-3 text-green-600" />
                          <span>
                            Expected: {rec.estimated_impact.metric} {rec.estimated_impact.expected_change}
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => applyRecommendation(rec.id)}
                      className="ml-4"
                    >
                      Apply
                    </Button>
                  </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* All Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>All Alerts</CardTitle>
            <CardDescription>Active alerts and warnings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-start justify-between p-4 border rounded-lg ${
                    alert.severity === 'critical' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getSeverityIcon(alert.severity)}
                      <h3 className="font-semibold text-gray-900">{alert.title}</h3>
                      <Badge className={getPriorityColor(alert.severity)}>
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">{alert.message}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => acknowledgeAlert(alert.id)}
                  >
                    Dismiss
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}



