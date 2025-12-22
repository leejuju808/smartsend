'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Play, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface QACheck {
  id: string;
  check_code: string;
  category: string;
  name: string;
  description: string | null;
  critical: boolean;
}

interface QACheckResult {
  id: string;
  check_id: string;
  status: 'pending' | 'pass' | 'fail' | 'warning' | 'skipped';
  message: string;
  details: Record<string, any>;
  checked_at: string;
  qa_checks: QACheck;
}

interface QACheckRun {
  id: string;
  account_id: string;
  run_type: string;
  category: string | null;
  status: string;
  total_checks: number;
  passed_checks: number;
  failed_checks: number;
  warning_checks: number;
  critical_failures: number;
  can_launch: boolean;
  started_at: string;
  completed_at: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  core_system: 'A. Core System',
  billing_guard: 'B. Billing Guard',
  campaign_engine: 'C. Campaign Engine',
  template_library: 'D. Template Library',
  ai_personalization: 'E. AI Personalization',
  reply_ai: 'F. Reply AI',
  smart_routing: 'G. Smart Routing',
  sms_forwarding: 'H. SMS Forwarding',
  lead_timeline: 'I. Lead Timeline',
  system_health: 'J. System Health',
  frontend_quality: 'K. Frontend Quality',
  performance: 'L. Performance',
  security: 'M. Security',
};

export default function QAChecklistPage() {
  const [checks, setChecks] = useState<QACheck[]>([]);
  const [results, setResults] = useState<QACheckResult[]>([]);
  const [latestRun, setLatestRun] = useState<QACheckRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [canLaunch, setCanLaunch] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadData();
    checkLaunchStatus();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Load checks
      const { data: checksData } = await supabase
        .from('qa_checks')
        .select('*')
        .order('check_code');

      if (checksData) {
        setChecks(checksData as QACheck[]);
      }

      // Load latest results
      const response = await fetch('/api/qa/results?latest=true');
      const { run, results: resultsData } = await response.json();

      if (run) {
        setLatestRun(run);
      }

      if (resultsData) {
        setResults(resultsData);
      }
    } catch (error) {
      console.error('Error loading QA data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function checkLaunchStatus() {
    try {
      const response = await fetch('/api/qa/can-launch');
      const { canLaunch: canLaunchStatus } = await response.json();
      setCanLaunch(canLaunchStatus);
    } catch (error) {
      console.error('Error checking launch status:', error);
    }
  }

  async function runChecks(runType: 'full' | 'category' = 'full', category?: string) {
    setRunning(true);
    try {
      const response = await fetch('/api/qa/checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runType, category }),
      });

      const result = await response.json();

      if (result.success) {
        // Reload data
        await loadData();
        await checkLaunchStatus();
      } else {
        alert(`Failed to run checks: ${result.error}`);
      }
    } catch (error: any) {
      console.error('Error running checks:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setRunning(false);
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'fail':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'pending':
        return <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />;
      default:
        return null;
    }
  }

  function getStatusBadge(status: string) {
    const variants: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
      pass: 'default',
      fail: 'destructive',
      warning: 'secondary',
      pending: 'outline',
      skipped: 'outline',
    };

    return (
      <Badge variant={variants[status] || 'outline'}>
        {status.toUpperCase()}
      </Badge>
    );
  }

  // Group checks by category
  const checksByCategory = checks.reduce((acc, check) => {
    if (!acc[check.category]) {
      acc[check.category] = [];
    }
    acc[check.category].push(check);
    return acc;
  }, {} as Record<string, QACheck[]>);

  // Get result for a check
  function getResultForCheck(checkId: string): QACheckResult | undefined {
    return results.find(r => r.check_id === checkId);
  }

  // Calculate category stats
  function getCategoryStats(category: string) {
    const categoryChecks = checksByCategory[category] || [];
    const categoryResults = categoryChecks.map(c => getResultForCheck(c.id)).filter(Boolean) as QACheckResult[];

    const passed = categoryResults.filter(r => r.status === 'pass').length;
    const failed = categoryResults.filter(r => r.status === 'fail').length;
    const warnings = categoryResults.filter(r => r.status === 'warning').length;
    const criticalFailures = categoryResults.filter(
      r => r.status === 'fail' && categoryChecks.find(c => c.id === r.check_id)?.critical
    ).length;

    return {
      total: categoryChecks.length,
      passed,
      failed,
      warnings,
      criticalFailures,
      canLaunch: criticalFailures === 0,
    };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pre-Launch QA Checklist</h1>
          <p className="text-muted-foreground mt-1">
            Block 9990 — Every system must pass before SmartSend goes live
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => runChecks('full')}
            disabled={running}
            variant="default"
          >
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run Full Check
              </>
            )}
          </Button>
          <Button onClick={loadData} variant="outline" disabled={running}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Launch Status Alert */}
      {latestRun && (
        <Alert className={canLaunch ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}>
          <AlertTitle className="flex items-center gap-2">
            {canLaunch ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Ready to Launch
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-500" />
                Not Ready to Launch
              </>
            )}
          </AlertTitle>
          <AlertDescription>
            {canLaunch ? (
              <span>
                All critical checks have passed. SmartSend is ready for invite-only beta.
              </span>
            ) : (
              <span>
                {latestRun.critical_failures} critical check{latestRun.critical_failures !== 1 ? 's' : ''} failed.
                Fix these issues before allowing roofers to use SmartSend.
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Stats */}
      {latestRun && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Checks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{latestRun.total_checks}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-600">Passed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{latestRun.passed_checks}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-600">Failed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{latestRun.failed_checks}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-yellow-600">Warnings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{latestRun.warning_checks}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-600">Critical Failures</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{latestRun.critical_failures}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Checklist by Category */}
      <Tabs defaultValue="core_system" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          {Object.keys(checksByCategory).map(category => {
            const stats = getCategoryStats(category);
            return (
              <TabsTrigger
                key={category}
                value={category}
                className="flex flex-col items-start gap-1"
              >
                <span>{CATEGORY_LABELS[category] || category}</span>
                <div className="flex gap-1 text-xs">
                  <span className={stats.criticalFailures > 0 ? 'text-red-500' : 'text-green-500'}>
                    {stats.passed}/{stats.total}
                  </span>
                  {stats.criticalFailures > 0 && (
                    <span className="text-red-500">⚠</span>
                  )}
                </div>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {Object.keys(checksByCategory).map(category => (
          <TabsContent key={category} value={category} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{CATEGORY_LABELS[category] || category}</CardTitle>
                <CardDescription>
                  {checksByCategory[category].length} checks in this category
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {checksByCategory[category].map(check => {
                    const result = getResultForCheck(check.id);
                    const status = result?.status || 'pending';

                    return (
                      <div
                        key={check.id}
                        className="flex items-start gap-4 p-4 border rounded-lg"
                      >
                        <div className="mt-0.5">{getStatusIcon(status)}</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{check.check_code}</span>
                            <span className="text-sm text-muted-foreground">{check.name}</span>
                            {check.critical && (
                              <Badge variant="destructive" className="text-xs">CRITICAL</Badge>
                            )}
                            {getStatusBadge(status)}
                          </div>
                          {check.description && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {check.description}
                            </p>
                          )}
                          {result && (
                            <div className="mt-2">
                              <p className="text-sm">{result.message}</p>
                              {result.details && Object.keys(result.details).length > 0 && (
                                <details className="mt-2">
                                  <summary className="text-xs text-muted-foreground cursor-pointer">
                                    View details
                                  </summary>
                                  <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto">
                                    {JSON.stringify(result.details, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
























































