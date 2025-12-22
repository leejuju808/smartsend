'use client'

import { useState, useEffect } from 'react'
import { 
  DollarSign, TrendingUp, TrendingDown, Users, BarChart3, 
  AlertTriangle, CheckCircle2, Clock, Calendar, Target,
  ArrowUpRight, ArrowDownRight, Activity, PieChart
} from 'lucide-react'
import { JobProfitabilityDashboard } from './JobProfitabilityDashboard'
import { SalesDashboard } from './SalesDashboard'
import { MarketingDashboard } from './MarketingDashboard'
import { CrewPerformanceDashboard } from './CrewPerformanceDashboard'
import { CashflowDashboard } from './CashflowDashboard'
import { AIInsightsPanel } from './AIInsightsPanel'
import { PredictiveAlertsPanel } from './PredictiveAlertsPanel'

interface ReportingEngineDashboardProps {
  workspaceId: string
  companyId?: string
}

export default function ReportingEngineDashboard({ 
  workspaceId, 
  companyId 
}: ReportingEngineDashboardProps) {
  const [activeTab, setActiveTab] = useState<string>('overview')
  const [loading, setLoading] = useState(true)

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'job-profit', label: 'Job Profitability', icon: DollarSign },
    { id: 'sales', label: 'Sales Performance', icon: Users },
    { id: 'marketing', label: 'Marketing ROI', icon: Target },
    { id: 'crews', label: 'Crew Performance', icon: Activity },
    { id: 'cashflow', label: 'Cashflow & AR', icon: TrendingUp },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold text-gray-900">Reporting & Insights Engine</h1>
        <p className="text-gray-600 mt-2">
          The command center for your roofing business — see exactly where your money goes.
        </p>
      </div>

      {/* AI Insights & Alerts Banner */}
      <div className="grid md:grid-cols-2 gap-4">
        <AIInsightsPanel workspaceId={workspaceId} companyId={companyId} />
        <PredictiveAlertsPanel workspaceId={workspaceId} companyId={companyId} />
      </div>

      {/* Tab Navigation */}
      <div className="border-b">
        <nav className="flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                  ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'overview' && (
          <OverviewDashboard workspaceId={workspaceId} companyId={companyId} />
        )}
        {activeTab === 'job-profit' && (
          <JobProfitabilityDashboard workspaceId={workspaceId} companyId={companyId} />
        )}
        {activeTab === 'sales' && (
          <SalesDashboard workspaceId={workspaceId} companyId={companyId} />
        )}
        {activeTab === 'marketing' && (
          <MarketingDashboard workspaceId={workspaceId} companyId={companyId} />
        )}
        {activeTab === 'crews' && (
          <CrewPerformanceDashboard workspaceId={workspaceId} companyId={companyId} />
        )}
        {activeTab === 'cashflow' && (
          <CashflowDashboard workspaceId={workspaceId} companyId={companyId} />
        )}
      </div>
    </div>
  )
}

function OverviewDashboard({ workspaceId, companyId }: { workspaceId: string; companyId?: string }) {
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch overview metrics
    Promise.all([
      fetch(`/api/reports/job-profit?workspace_id=${workspaceId}${companyId ? `&company_id=${companyId}` : ''}`).then(r => r.json()),
      fetch(`/api/reports/sales?workspace_id=${workspaceId}${companyId ? `&company_id=${companyId}` : ''}`).then(r => r.json()),
      fetch(`/api/reports/marketing?workspace_id=${workspaceId}${companyId ? `&company_id=${companyId}` : ''}`).then(r => r.json()),
      fetch(`/api/reports/cashflow?workspace_id=${workspaceId}${companyId ? `&company_id=${companyId}` : ''}`).then(r => r.json()),
    ]).then(([profit, sales, marketing, cashflow]) => {
      setMetrics({ profit, sales, marketing, cashflow })
      setLoading(false)
    }).catch(err => {
      console.error('Error loading metrics:', err)
      setLoading(false)
    })
  }, [workspaceId, companyId])

  if (loading) {
    return <div className="text-center py-12">Loading metrics...</div>
  }

  const profitSummary = metrics?.profit?.summary || {}
  const salesSummary = metrics?.sales?.summary || {}
  const marketingSummary = metrics?.marketing?.summary || {}
  const cashflowCurrent = metrics?.cashflow?.current || {}

  return (
    <div className="space-y-6">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Revenue"
          value={`$${((profitSummary.total_revenue || 0) / 1000).toFixed(1)}K`}
          subtitle="This month"
          icon={DollarSign}
          color="green"
        />
        <MetricCard
          title="Avg Job Margin"
          value={`${(profitSummary.avg_margin || 0).toFixed(1)}%`}
          subtitle={`${profitSummary.total_jobs || 0} jobs`}
          icon={TrendingUp}
          color={profitSummary.avg_margin > 30 ? "green" : profitSummary.avg_margin > 20 ? "orange" : "red"}
        />
        <MetricCard
          title="Jobs Sold"
          value={salesSummary.total_jobs_sold || 0}
          subtitle={`${salesSummary.total_reps || 0} reps`}
          icon={CheckCircle2}
          color="blue"
        />
        <MetricCard
          title="Cashflow Health"
          value={cashflowCurrent.cashflow_health_score ? `${cashflowCurrent.cashflow_health_score}%` : 'N/A'}
          subtitle={`AR: $${((cashflowCurrent.ar_total || 0) / 1000).toFixed(1)}K`}
          icon={Activity}
          color={cashflowCurrent.cashflow_health_score > 70 ? "green" : cashflowCurrent.cashflow_health_score > 50 ? "orange" : "red"}
        />
      </div>

      {/* Alerts & Warnings */}
      {(profitSummary.loss_jobs_count > 0 || cashflowCurrent.ar_overdue_90 > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Attention Required</h3>
              <ul className="mt-2 text-sm text-red-800 space-y-1">
                {profitSummary.loss_jobs_count > 0 && (
                  <li>{profitSummary.loss_jobs_count} jobs are losing money (${Math.abs(profitSummary.loss_jobs_total || 0).toFixed(0)})</li>
                )}
                {cashflowCurrent.ar_overdue_90 > 0 && (
                  <li>${((cashflowCurrent.ar_overdue_90 || 0) / 1000).toFixed(1)}K in invoices overdue 90+ days</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Top Sales Rep</h3>
          {salesSummary.total_reps > 0 ? (
            <div className="space-y-1">
              <p className="text-lg font-semibold">Top performer</p>
              <p className="text-sm text-gray-600">See Sales tab for details</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No sales data</p>
          )}
        </div>

        <div className="bg-white border rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Best Marketing Channel</h3>
          {marketingSummary.total_channels > 0 ? (
            <div className="space-y-1">
              <p className="text-lg font-semibold">Top ROI channel</p>
              <p className="text-sm text-gray-600">See Marketing tab for details</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No marketing data</p>
          )}
        </div>

        <div className="bg-white border rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Crew Efficiency</h3>
          <div className="space-y-1">
            <p className="text-lg font-semibold">Performance tracking</p>
            <p className="text-sm text-gray-600">See Crews tab for details</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  color = "blue" 
}: { 
  title: string
  value: string | number
  subtitle?: string
  icon: any
  color?: "blue" | "green" | "orange" | "red"
}) {
  const colorClasses = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    green: "bg-green-50 border-green-200 text-green-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    red: "bg-red-50 border-red-200 text-red-700",
  }

  const iconColorClasses = {
    blue: "text-blue-600",
    green: "text-green-600",
    orange: "text-orange-600",
    red: "text-red-600",
  }

  return (
    <div className={`rounded-lg border-2 p-6 ${colorClasses[color]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium opacity-80 mb-1">{title}</p>
          <p className="text-3xl font-bold mb-2">{value}</p>
          {subtitle && <p className="text-sm opacity-70">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-lg bg-white ${iconColorClasses[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  )
}

























