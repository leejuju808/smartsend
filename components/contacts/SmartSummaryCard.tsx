// Block 19100 — SmartSend Smart Summary v1
"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Sparkles, 
  User, 
  AlertTriangle, 
  Package, 
  Calendar, 
  CloudLightning, 
  Shield, 
  DollarSign, 
  Clock, 
  CheckSquare,
  ArrowRight,
  RefreshCw,
  TrendingUp,
  Zap
} from "lucide-react";
import { Skeleton } from "@/src/components/ui/skeleton";

interface SmartSummaryCardProps {
  contactId: string;
}

interface SmartSummary {
  contact_overview: {
    homeowner_name: string;
    address: string;
    phone: string;
    line_type: string;
    email: string;
    email_quality: string;
    last_reply: string | null;
    priority_score: number;
  };
  core_issue_summary: {
    detected_problem: string;
    severity_score: number;
    photo_evidence: number;
    interior_leak_indicators: number;
    repair_vs_replacement_likelihood: string;
  };
  material_summary: {
    material_type: string;
    pitch: string;
    layers: string;
    roof_configuration: {
      has_skylights: boolean;
      has_chimney: boolean;
      has_box_vents: boolean;
      has_ridge_vents: boolean;
      has_pipe_boots: boolean;
    };
    vulnerable_components: string[];
  };
  roof_age_summary: {
    estimated_age_range: {
      min: number | null;
      max: number | null;
      median: number | null;
    };
    confidence_score: number;
    replacement_probability: number;
    insurance_impact: string;
    age_band: string;
  };
  storm_impact_summary: {
    hail_size: string | null;
    wind_speed: string | null;
    storm_date: string | null;
    zip_vulnerability: string | null;
    storm_zone: string | null;
    storm_score: number;
  };
  insurance_summary: {
    claim_type: string;
    deductible_info: {
      deductible: number | null;
      acv: number | null;
      rcv: number | null;
    };
    adjuster_status: {
      adjuster_name: string | null;
      adjuster_phone: string | null;
      adjuster_email: string | null;
    };
    approval_likelihood: string;
    coverage_type: string | null;
    supplement_opportunities: string | null;
    insurance_probability: number;
  };
  value_summary: {
    repair_estimate: {
      min: number | null;
      max: number | null;
      avg: number | null;
    };
    replacement_estimate: {
      min: number | null;
      max: number | null;
      avg: number | null;
    };
    insurance_payout_range: {
      min: number | null;
      max: number | null;
    };
    total_money_score: number;
    job_category: string;
  };
  timeline_summary: Array<{
    type: string;
    description: string;
    timestamp: string;
  }>;
  task_summary: {
    urgent_tasks: Array<{ id: string; title: string; due_date: string; status: string }>;
    overdue_tasks: Array<{ id: string; title: string; due_date: string }>;
    insurance_tasks: Array<{ id: string; title: string }>;
    repair_tasks: Array<{ id: string; title: string }>;
    booking_tasks: Array<{ id: string; title: string }>;
    recommended_actions: any[];
  };
  next_step_recommendation: {
    recommendation: string;
    reasoning: string;
    urgency: string;
    cta_text: string;
  };
  alerts: string[];
}

export function SmartSummaryCard({ contactId }: SmartSummaryCardProps) {
  const [summary, setSummary] = useState<SmartSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [mode, setMode] = useState<'default' | 'sales' | 'prep' | 'office'>('default');

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/summary/${contactId}?mode=${mode}`);
      if (!response.ok) throw new Error('Failed to fetch summary');
      const data = await response.json();
      if (data.summary) {
        setSummary(data.summary);
      } else if (data.summary) {
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('Error fetching summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = async () => {
    try {
      setGenerating(true);
      const response = await fetch(`/api/summary/${contactId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary_mode: mode }),
      });
      if (!response.ok) throw new Error('Failed to generate summary');
      const data = await response.json();
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('Error generating summary:', error);
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [contactId, mode]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Smart Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64" />
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Smart Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">No summary available</p>
            <Button onClick={generateSummary} disabled={generating}>
              {generating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Smart Summary
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high': return 'bg-red-100 text-red-800 border-red-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  const getAlertBadge = (alert: string) => {
    const alertMap: Record<string, { label: string; color: string }> = {
      'high_storm_opportunity': { label: 'High Storm Opportunity', color: 'bg-orange-500' },
      'insurance_candidate': { label: 'Insurance Candidate', color: 'bg-blue-500' },
      'urgent_leak': { label: 'Urgent Leak', color: 'bg-red-500' },
      'high_value_replacement_opportunity': { label: 'High Value Replacement', color: 'bg-green-500' },
      'appointment_recommended_today': { label: 'Appointment Recommended', color: 'bg-purple-500' },
    };
    const config = alertMap[alert] || { label: alert, color: 'bg-gray-500' };
    return <Badge key={alert} className={`${config.color} text-white`}>{config.label}</Badge>;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Smart Summary
          </CardTitle>
          <div className="flex items-center gap-2">
            <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
              <TabsList>
                <TabsTrigger value="default">Default</TabsTrigger>
                <TabsTrigger value="sales">Sales</TabsTrigger>
                <TabsTrigger value="prep">Prep</TabsTrigger>
                <TabsTrigger value="office">Office</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="sm"
              onClick={generateSummary}
              disabled={generating}
            >
              <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        {summary.alerts && summary.alerts.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {summary.alerts.map(alert => getAlertBadge(alert))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="issue">Issue</TabsTrigger>
            <TabsTrigger value="intelligence">Intel</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="next">Next Step</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* 1️⃣ Contact Overview */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <User className="h-4 w-4" />
                1️⃣ Contact Overview
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Name:</span> {summary.contact_overview.homeowner_name}
                </div>
                <div>
                  <span className="text-muted-foreground">Priority Score:</span>{' '}
                  <Badge variant={summary.contact_overview.priority_score >= 70 ? 'default' : 'secondary'}>
                    {summary.contact_overview.priority_score}
                  </Badge>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Address:</span> {summary.contact_overview.address}
                </div>
                <div>
                  <span className="text-muted-foreground">Phone:</span> {summary.contact_overview.phone || 'N/A'}
                </div>
                <div>
                  <span className="text-muted-foreground">Email:</span> {summary.contact_overview.email || 'N/A'}
                </div>
                {summary.contact_overview.last_reply && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Last Reply:</span>{' '}
                    {new Date(summary.contact_overview.last_reply).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>

            {/* 7️⃣ Value Summary */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                7️⃣ Value Summary
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Money Score:</span>
                  <Badge className="bg-green-500">
                    {summary.value_summary.total_money_score}/100
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Job Category:</span>
                  <Badge>{summary.value_summary.job_category || 'Unknown'}</Badge>
                </div>
                {summary.value_summary.repair_estimate.avg && (
                  <div>
                    <span className="text-muted-foreground">Repair Estimate:</span>{' '}
                    ${summary.value_summary.repair_estimate.avg.toLocaleString()}
                  </div>
                )}
                {summary.value_summary.replacement_estimate.avg && (
                  <div>
                    <span className="text-muted-foreground">Replacement Estimate:</span>{' '}
                    ${summary.value_summary.replacement_estimate.avg.toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Issue Tab */}
          <TabsContent value="issue" className="space-y-4">
            {/* 2️⃣ Core Issue Summary */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                2️⃣ Core Issue Summary
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Detected Problem:</span>{' '}
                  {summary.core_issue_summary.detected_problem}
                </div>
                <div className="flex items-center justify-between">
                  <span>Severity Score:</span>
                  <Badge variant={summary.core_issue_summary.severity_score >= 60 ? 'destructive' : 'secondary'}>
                    {summary.core_issue_summary.severity_score}/100
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Photo Evidence:</span> {summary.core_issue_summary.photo_evidence} photos
                </div>
                {summary.core_issue_summary.interior_leak_indicators > 0 && (
                  <div className="text-red-600">
                    ⚠️ {summary.core_issue_summary.interior_leak_indicators} interior leak indicators
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Repair vs Replacement:</span>{' '}
                  <Badge>{summary.core_issue_summary.repair_vs_replacement_likelihood}</Badge>
                </div>
              </div>
            </div>

            {/* 3️⃣ Material Summary */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Package className="h-4 w-4" />
                3️⃣ Material Summary
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Material Type:</span>{' '}
                  <Badge>{summary.material_summary.material_type || 'Unknown'}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Pitch:</span> {summary.material_summary.pitch || 'Unknown'}
                </div>
                <div>
                  <span className="text-muted-foreground">Layers:</span> {summary.material_summary.layers || 'Unknown'}
                </div>
                {summary.material_summary.roof_configuration && (
                  <div>
                    <span className="text-muted-foreground">Components:</span>{' '}
                    {[
                      summary.material_summary.roof_configuration.has_skylights && 'Skylights',
                      summary.material_summary.roof_configuration.has_chimney && 'Chimney',
                      summary.material_summary.roof_configuration.has_box_vents && 'Box Vents',
                      summary.material_summary.roof_configuration.has_ridge_vents && 'Ridge Vents',
                      summary.material_summary.roof_configuration.has_pipe_boots && 'Pipe Boots',
                    ].filter(Boolean).join(', ') || 'None'}
                  </div>
                )}
              </div>
            </div>

            {/* 4️⃣ Roof Age Summary */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                4️⃣ Roof Age Summary
              </h3>
              <div className="space-y-2 text-sm">
                {summary.roof_age_summary.estimated_age_range.min && (
                  <div>
                    <span className="text-muted-foreground">Estimated Age:</span>{' '}
                    {summary.roof_age_summary.estimated_age_range.min}-{summary.roof_age_summary.estimated_age_range.max} years
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span>Confidence:</span>
                  <Badge>{summary.roof_age_summary.confidence_score}%</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Replacement Probability:</span>
                  <Badge variant={summary.roof_age_summary.replacement_probability >= 70 ? 'destructive' : 'secondary'}>
                    {summary.roof_age_summary.replacement_probability}%
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Insurance Impact:</span>{' '}
                  <Badge>{summary.roof_age_summary.insurance_impact || 'Unknown'}</Badge>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Intelligence Tab */}
          <TabsContent value="intelligence" className="space-y-4">
            {/* 5️⃣ Storm Impact Summary */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <CloudLightning className="h-4 w-4" />
                5️⃣ Storm Impact Summary
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Storm Score:</span>
                  <Badge variant={summary.storm_impact_summary.storm_score >= 60 ? 'default' : 'secondary'}>
                    {summary.storm_impact_summary.storm_score}/100
                  </Badge>
                </div>
                {summary.storm_impact_summary.storm_date && (
                  <div>
                    <span className="text-muted-foreground">Storm Date:</span>{' '}
                    {new Date(summary.storm_impact_summary.storm_date).toLocaleDateString()}
                  </div>
                )}
                {summary.storm_impact_summary.storm_zone && (
                  <div>
                    <span className="text-muted-foreground">Storm Zone:</span>{' '}
                    <Badge>{summary.storm_impact_summary.storm_zone}</Badge>
                  </div>
                )}
              </div>
            </div>

            {/* 6️⃣ Insurance Summary */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4" />
                6️⃣ Insurance Summary
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Insurance Probability:</span>
                  <Badge variant={summary.insurance_summary.insurance_probability >= 60 ? 'default' : 'secondary'}>
                    {summary.insurance_summary.insurance_probability}%
                  </Badge>
                </div>
                {summary.insurance_summary.claim_type && (
                  <div>
                    <span className="text-muted-foreground">Claim Status:</span>{' '}
                    <Badge>{summary.insurance_summary.claim_type}</Badge>
                  </div>
                )}
                {summary.insurance_summary.deductible_info.deductible && (
                  <div>
                    <span className="text-muted-foreground">Deductible:</span>{' '}
                    ${summary.insurance_summary.deductible_info.deductible.toLocaleString()}
                  </div>
                )}
                {summary.insurance_summary.adjuster_status.adjuster_name && (
                  <div>
                    <span className="text-muted-foreground">Adjuster:</span>{' '}
                    {summary.insurance_summary.adjuster_status.adjuster_name}
                  </div>
                )}
                {summary.insurance_summary.approval_likelihood && (
                  <div>
                    <span className="text-muted-foreground">Approval Likelihood:</span>{' '}
                    <Badge>{summary.insurance_summary.approval_likelihood}</Badge>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="space-y-4">
            {/* 8️⃣ Timeline Summary */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" />
                8️⃣ Timeline Summary (Last 72 Hours)
              </h3>
              {summary.timeline_summary.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {summary.timeline_summary.map((event, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-muted-foreground">•</span>
                      <div className="flex-1">
                        <div>{event.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(event.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No recent activity</p>
              )}
            </div>

            {/* 9️⃣ Task Summary */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <CheckSquare className="h-4 w-4" />
                9️⃣ Task Summary
              </h3>
              <div className="space-y-3 text-sm">
                {summary.task_summary.urgent_tasks && summary.task_summary.urgent_tasks.length > 0 && (
                  <div>
                    <div className="font-medium text-red-600 mb-1">Urgent Tasks:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {summary.task_summary.urgent_tasks.map((task) => (
                        <li key={task.id}>{task.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.task_summary.overdue_tasks && summary.task_summary.overdue_tasks.length > 0 && (
                  <div>
                    <div className="font-medium text-orange-600 mb-1">Overdue Tasks:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {summary.task_summary.overdue_tasks.map((task) => (
                        <li key={task.id}>{task.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.task_summary.insurance_tasks && summary.task_summary.insurance_tasks.length > 0 && (
                  <div>
                    <div className="font-medium mb-1">Insurance Tasks:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {summary.task_summary.insurance_tasks.map((task) => (
                        <li key={task.id}>{task.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.task_summary.repair_tasks && summary.task_summary.repair_tasks.length > 0 && (
                  <div>
                    <div className="font-medium mb-1">Repair Tasks:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {summary.task_summary.repair_tasks.map((task) => (
                        <li key={task.id}>{task.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.task_summary.booking_tasks && summary.task_summary.booking_tasks.length > 0 && (
                  <div>
                    <div className="font-medium mb-1">Booking Tasks:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {summary.task_summary.booking_tasks.map((task) => (
                        <li key={task.id}>{task.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Next Step Tab */}
          <TabsContent value="next" className="space-y-4">
            {/* 🔟 Smart Next-Step Recommendation */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4" />
                🔟 Smart Next-Step Recommendation
              </h3>
              <div className={`p-4 rounded-lg border-2 ${getUrgencyColor(summary.next_step_recommendation.urgency)}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="font-bold text-lg mb-2">
                      {summary.next_step_recommendation.recommendation}
                    </div>
                    <div className="text-sm opacity-90">
                      {summary.next_step_recommendation.reasoning}
                    </div>
                  </div>
                  <Button className="shrink-0">
                    {summary.next_step_recommendation.cta_text}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}





















































