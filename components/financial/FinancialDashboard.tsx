"use client";

import * as React from "react";
import { JobProfitBrain } from "./JobProfitBrain";
import { CashflowForecast } from "./CashflowForecast";
import { FinancialAlerts } from "./FinancialAlerts";
import { ProfitAnalytics } from "./ProfitAnalytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";

interface FinancialDashboardProps {
  companyId: string;
  jobId?: string;
}

/**
 * Block 254200: Financial Intelligence Engine Dashboard
 * Main dashboard for financial control center
 */
export function FinancialDashboard({ companyId, jobId }: FinancialDashboardProps) {
  const [activeTab, setActiveTab] = React.useState("overview");
  const [financials, setFinancials] = React.useState<any>(null);
  const [forecast, setForecast] = React.useState<any>(null);
  const [alerts, setAlerts] = React.useState<any[]>([]);
  const [analytics, setAnalytics] = React.useState<any>({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadFinancialData();
  }, [companyId, jobId]);

  const loadFinancialData = async () => {
    setLoading(true);
    try {
      // Load alerts
      const alertsRes = await fetch(`/api/financial/alerts?company_id=${companyId}`);
      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setAlerts(alertsData.alerts || []);
      }

      // Load cashflow forecast
      const forecastRes = await fetch(
        `/api/financial/cashflow/forecast?company_id=${companyId}`
      );
      if (forecastRes.ok) {
        const forecastData = await forecastRes.json();
        setForecast(forecastData.forecast);
      }

      // Load profit analytics
      const analyticsRes = await fetch(
        `/api/financial/analytics?company_id=${companyId}&type=all`
      );
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData);
      }

      // Load job financials if jobId provided
      if (jobId) {
        const jobRes = await fetch(`/api/financial/job/${jobId}`);
        if (jobRes.ok) {
          const jobData = await jobRes.json();
          setFinancials(jobData.financials);
        }
      }
    } catch (error) {
      console.error("Error loading financial data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground">Loading financial data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Financial Alerts */}
      {alerts.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Financial Alerts</h2>
          <FinancialAlerts companyId={companyId} alerts={alerts} />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="cashflow">Cashflow</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          {jobId && <TabsTrigger value="job">Job Profit</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {jobId && financials && (
              <JobProfitBrain
                jobId={jobId}
                financials={financials}
                onRefresh={loadFinancialData}
              />
            )}
            <CashflowForecast
              companyId={companyId}
              forecast={forecast}
              onRefresh={loadFinancialData}
            />
          </div>
        </TabsContent>

        <TabsContent value="cashflow">
          <CashflowForecast
            companyId={companyId}
            forecast={forecast}
            onRefresh={loadFinancialData}
          />
        </TabsContent>

        <TabsContent value="analytics">
          <ProfitAnalytics
            companyId={companyId}
            crew={analytics.crew}
            jobType={analytics.job_type}
            supplier={analytics.supplier}
          />
        </TabsContent>

        {jobId && (
          <TabsContent value="job">
            {financials ? (
              <JobProfitBrain
                jobId={jobId}
                financials={financials}
                onRefresh={loadFinancialData}
              />
            ) : (
              <div className="text-center text-muted-foreground">
                No financial data available for this job.
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}






















