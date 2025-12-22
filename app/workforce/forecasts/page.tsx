'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  DollarSign,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  XCircle
} from 'lucide-react'

type ForecastSummary = {
  totalJobs: number
  totalProjectedRevenue: number
  totalProjectedCost: number
  totalProjectedProfit: number
  avgProjectedMargin: number
  riskBreakdown: {
    high: number
    medium: number
    low: number
  }
  marginBreakdown: {
    excellent: number
    good: number
    low: number
  }
}

type HighRiskJob = {
  job_id: string
  homeowner_name: string
  address: string
  predicted_profit: number
  predicted_margin: number
  risk_score: number
  risk_factors: Array<{
    factor: string
    severity: number
    description: string | null
  }>
}

type ForecastData = {
  summary: ForecastSummary
  highRiskJobs: HighRiskJob[]
  topProfitableJobs: Array<{
    job_id: string
    homeowner_name: string
    predicted_profit: number
    predicted_margin: number
    contract_price: number
  }>
  lowMarginJobs: Array<{
    job_id: string
    homeowner_name: string
    predicted_profit: number
    predicted_margin: number
    contract_price: number
    predicted_total_cost: number
  }>
  forecasts: Array<{
    id: string
    job_id: string
    homeowner_name: string | null
    address: string | null
    predicted_profit: number
    predicted_margin: number
    risk_level: string
    risk_score: number
    confidence_score: number
    production_date: string | null
  }>
}

export default function OwnerForecastDashboard() {
  const [data, setData] = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadForecasts()
  }, [])

  const loadForecasts = async () => {
    try {
      const res = await fetch('/api/workforce/forecasts/owner')
      const forecastData = await res.json()
      
      if (res.ok) {
        setData(forecastData)
      }
    } catch (error) {
      console.error('Error loading forecasts:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-gray-500">Loading forecast dashboard...</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-gray-500">No forecast data available</div>
      </div>
    )
  }

  const { summary, highRiskJobs, topProfitableJobs, lowMarginJobs } = data

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Job Cost Forecast Dashboard</h1>
        <p className="text-sm text-gray-600 mt-2">
          Predicted costs, margins, and risks for all upcoming jobs
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Projected Revenue */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-500">Total Projected Revenue</p>
            <DollarSign className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {formatCurrency(summary.totalProjectedRevenue)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {summary.totalJobs} upcoming jobs
          </p>
        </div>

        {/* Total Projected Cost */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-500">Total Projected Cost</p>
            <BarChart3 className="h-5 w-5 text-blue-600" />
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {formatCurrency(summary.totalProjectedCost)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Materials + Labor + Subs + Overhead
          </p>
        </div>

        {/* Total Projected Profit */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-500">Total Projected Profit</p>
            <TrendingUp className={`h-5 w-5 ${summary.totalProjectedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
          </div>
          <p className={`text-3xl font-bold ${summary.totalProjectedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(summary.totalProjectedProfit)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {summary.totalProjectedProfit >= 0 ? 'Expected profit' : 'Expected loss'}
          </p>
        </div>

        {/* Average Margin */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-500">Average Margin</p>
            <BarChart3 className={`h-5 w-5 ${summary.avgProjectedMargin >= 30 ? 'text-green-600' : summary.avgProjectedMargin >= 20 ? 'text-yellow-600' : 'text-red-600'}`} />
          </div>
          <p className={`text-3xl font-bold ${summary.avgProjectedMargin >= 30 ? 'text-green-600' : summary.avgProjectedMargin >= 20 ? 'text-yellow-600' : 'text-red-600'}`}>
            {summary.avgProjectedMargin.toFixed(1)}%
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {summary.avgProjectedMargin >= 30 ? 'Excellent' : summary.avgProjectedMargin >= 20 ? 'Good' : 'Low margin'}
          </p>
        </div>
      </div>

      {/* Risk & Margin Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Risk Breakdown */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Risk Breakdown</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span className="font-medium text-red-900">High Risk</span>
              </div>
              <span className="text-xl font-bold text-red-900">{summary.riskBreakdown.high}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <span className="font-medium text-yellow-900">Medium Risk</span>
              </div>
              <span className="text-xl font-bold text-yellow-900">{summary.riskBreakdown.medium}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-900">Low Risk</span>
              </div>
              <span className="text-xl font-bold text-green-900">{summary.riskBreakdown.low}</span>
            </div>
          </div>
        </div>

        {/* Margin Breakdown */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Margin Breakdown</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-900">Excellent (30%+)</span>
              </div>
              <span className="text-xl font-bold text-green-900">{summary.marginBreakdown.excellent}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-yellow-600" />
                <span className="font-medium text-yellow-900">Good (20-30%)</span>
              </div>
              <span className="text-xl font-bold text-yellow-900">{summary.marginBreakdown.good}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <span className="font-medium text-red-900">Low (&lt;20%)</span>
              </div>
              <span className="text-xl font-bold text-red-900">{summary.marginBreakdown.low}</span>
            </div>
          </div>
        </div>
      </div>

      {/* High Risk Jobs */}
      {highRiskJobs.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-red-50">
            <h2 className="text-lg font-semibold text-red-900">
              🚨 High Risk Jobs ({highRiskJobs.length})
            </h2>
            <p className="text-sm text-red-700 mt-1">
              Jobs with multiple risk factors that may impact cost, timeline, or safety
            </p>
          </div>
          <div className="divide-y divide-gray-200">
            {highRiskJobs.map((job) => (
              <div key={job.job_id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold text-gray-900">{job.homeowner_name}</span>
                      <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded-full">
                        Risk: {job.risk_score}/100
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        job.predicted_margin >= 30 ? 'bg-green-100 text-green-800' :
                        job.predicted_margin >= 20 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {job.predicted_margin.toFixed(1)}% margin
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{job.address}</p>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-gray-500">
                        Profit: <span className={job.predicted_profit >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                          {formatCurrency(job.predicted_profit)}
                        </span>
                      </span>
                    </div>
                    {job.risk_factors.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-xs font-medium text-gray-700">Risk Factors:</p>
                        {job.risk_factors.map((factor, idx) => (
                          <div key={idx} className="text-xs text-gray-600 pl-2">
                            • {factor.description || factor.factor.replace(/_/g, ' ')} (Severity: {factor.severity}/5)
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/workforce/jobs/${job.job_id}/forecast`}
                    className="ml-4 text-blue-600 hover:text-blue-900 flex items-center gap-1 text-sm"
                  >
                    View Forecast
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Profitable Jobs */}
      {topProfitableJobs.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Top Profitable Jobs</h2>
            <p className="text-sm text-gray-500 mt-1">Jobs with highest predicted profit</p>
          </div>
          <div className="divide-y divide-gray-200">
            {topProfitableJobs.map((job) => (
              <div key={job.job_id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-medium text-gray-900">{job.homeowner_name}</span>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        job.predicted_margin >= 30 ? 'bg-green-100 text-green-800' :
                        job.predicted_margin >= 20 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {job.predicted_margin.toFixed(1)}% margin
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span>Profit: <span className="font-semibold text-green-600">{formatCurrency(job.predicted_profit)}</span></span>
                      <span>Revenue: {formatCurrency(job.contract_price)}</span>
                    </div>
                  </div>
                  <Link
                    href={`/workforce/jobs/${job.job_id}/forecast`}
                    className="ml-4 text-blue-600 hover:text-blue-900 flex items-center gap-1 text-sm"
                  >
                    View Forecast
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Low Margin Jobs (At Risk) */}
      {lowMarginJobs.length > 0 && (
        <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-red-50">
            <h2 className="text-lg font-semibold text-red-900">
              ⚠️ Low Margin Jobs ({lowMarginJobs.length})
            </h2>
            <p className="text-sm text-red-700 mt-1">
              Jobs with margins below 20% - review costs carefully
            </p>
          </div>
          <div className="divide-y divide-gray-200">
            {lowMarginJobs.map((job) => (
              <div key={job.job_id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-medium text-gray-900">{job.homeowner_name}</span>
                      <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded-full">
                        {job.predicted_margin.toFixed(1)}% margin
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span>Profit: <span className={`font-semibold ${job.predicted_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(job.predicted_profit)}
                      </span></span>
                      <span>Revenue: {formatCurrency(job.contract_price)}</span>
                      <span>Cost: {formatCurrency(job.predicted_total_cost)}</span>
                    </div>
                  </div>
                  <Link
                    href={`/workforce/jobs/${job.job_id}/forecast`}
                    className="ml-4 text-blue-600 hover:text-blue-900 flex items-center gap-1 text-sm"
                  >
                    View Forecast
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
























