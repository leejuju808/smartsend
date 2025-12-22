'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { XCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { getLaunchStatus } from '@/lib/qa/launchGate';

interface LaunchGateProps {
  accountId: string;
  children: React.ReactNode;
  showWarning?: boolean; // If true, shows warning but doesn't block
}

export function LaunchGate({ accountId, children, showWarning = false }: LaunchGateProps) {
  const [canLaunch, setCanLaunch] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [latestRun, setLatestRun] = useState<any>(null);

  useEffect(() => {
    checkStatus();
  }, [accountId]);

  async function checkStatus() {
    setLoading(true);
    try {
      const status = await getLaunchStatus(accountId);
      setCanLaunch(status.canLaunch);
      setLatestRun(status.latestRun);
    } catch (error) {
      console.error('Error checking launch status:', error);
      setCanLaunch(false);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return null; // Or a loading spinner
  }

  // If can launch, show children
  if (canLaunch) {
    return <>{children}</>;
  }

  // If showWarning is true, show warning but don't block
  if (showWarning) {
    return (
      <>
        <Alert className="mb-4 border-yellow-500 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle>QA Checks Not Complete</AlertTitle>
          <AlertDescription>
            Some QA checks have not passed. Please review the QA checklist before launching.
            <Link href="/qa" className="ml-2 underline">
              View QA Checklist
            </Link>
          </AlertDescription>
        </Alert>
        {children}
      </>
    );
  }

  // Block access
  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card className="border-red-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            Launch Not Ready
          </CardTitle>
          <CardDescription>
            SmartSend cannot be used until all critical QA checks pass
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Before allowing roofers to use SmartSend, all critical systems must pass QA checks.
            </p>
            {latestRun && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Latest QA Run Results:</p>
                <ul className="text-sm space-y-1">
                  <li>Total Checks: {latestRun.total_checks}</li>
                  <li className="text-green-600">Passed: {latestRun.passed_checks}</li>
                  <li className="text-red-600">Failed: {latestRun.failed_checks}</li>
                  <li className="text-red-600 font-bold">
                    Critical Failures: {latestRun.critical_failures}
                  </li>
                </ul>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Link href="/qa">
              <Button>
                View QA Checklist
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Button variant="outline" onClick={checkStatus}>
              Refresh Status
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
























































