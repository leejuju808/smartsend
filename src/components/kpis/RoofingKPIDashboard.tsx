/**
 * Block 24820 — SmartSend Roofing KPI Dashboard
 * The full roofing analytics system with 8 core panels
 */

'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import LeadCloseFunnelPanel from './panels/LeadCloseFunnelPanel'
import RevenueSummaryPanel from './panels/RevenueSummaryPanel'
import ForecastingPanel from './panels/ForecastingPanel'
import CrewMetricsPanel from './panels/CrewMetricsPanel'
import SupplierMetricsPanel from './panels/SupplierMetricsPanel'
import InsuranceKPIsPanel from './panels/InsuranceKPIsPanel'
import NeighborhoodPerformancePanel from './panels/NeighborhoodPerformancePanel'
import OwnerKPISnapshot from './panels/OwnerKPISnapshot'
import AIInsightsPanel from './panels/AIInsightsPanel'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function RoofingKPIDashboard() {
  const { data, error, isLoading, mutate } = useSWR('/api/kpis', fetcher, {
    refreshInterval: 60000, // Refresh every minute
  })

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">Error loading KPI data. Please try again.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Owner KPI Snapshot - Top Bar */}
      <OwnerKPISnapshot data={data?.ownerSnapshot} />

      {/* AI Insights */}
      <AIInsightsPanel insights={data?.insights?.insights || []} />

      {/* 8 Core KPI Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LeadCloseFunnelPanel data={data?.leadFunnel} />
        <RevenueSummaryPanel data={data?.revenue} />
        <ForecastingPanel data={data?.forecast} />
        <CrewMetricsPanel crews={data?.crews || []} />
        <SupplierMetricsPanel suppliers={data?.suppliers || []} />
        <InsuranceKPIsPanel data={data?.insurance} />
        <NeighborhoodPerformancePanel neighborhoods={data?.neighborhoods || []} />
      </div>
    </div>
  )
}






































