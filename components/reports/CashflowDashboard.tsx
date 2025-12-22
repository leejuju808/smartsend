'use client'

import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, Calendar } from 'lucide-react'

interface CashflowDashboardProps {
  workspaceId: string
  companyId?: string
}

export function CashflowDashboard({ workspaceId, companyId }: CashflowDashboardProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/reports/cashflow?workspace_id=${workspaceId}${companyId ? `&company_id=${companyId}` : ''}`)
      .then(r => r.json())
      .then(data => {
        setData(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading cashflow data:', err)
        setLoading(false)
      })
  }, [workspaceId, companyId])

  if (loading) {
    return <div className="text-center py-12">Loading cashflow data...</div>
  }

  const current = data?.current || {}
  const projections = data?.projections || {}

  const netCashflow = (Number(current.cash_in) || 0) - (Number(current.cash_out) || 0)
  const healthScore = Number(current.cashflow_health_score) || 0

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Cash In</div>
          <div className="text-3xl font-bold text-green-600">
            ${((Number(current.cash_in) || 0) / 1000).toFixed(1)}K
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Payments received
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Cash Out</div>
          <div className="text-3xl font-bold text-red-600">
            ${((Number(current.cash_out) || 0) / 1000).toFixed(1)}K
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Expenses paid
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Net Cashflow</div>
          <div className={`text-3xl font-bold ${netCashflow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${(netCashflow / 1000).toFixed(1)}K
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Current period
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Cashflow Health</div>
          <div className={`text-3xl font-bold ${
            healthScore > 70 ? 'text-green-600' : 
            healthScore > 50 ? 'text-orange-600' : 'text-red-600'
          }`}>
            {healthScore.toFixed(0)}%
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Health score
          </div>
        </div>
      </div>

      {/* AR Aging */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Accounts Receivable (AR)</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <div className="text-sm text-gray-500 mb-1">Total AR</div>
            <div className="text-2xl font-bold text-gray-900">
              ${((Number(current.ar_total) || 0) / 1000).toFixed(1)}K
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">Current (0-30)</div>
            <div className="text-xl font-semibold text-green-600">
              ${((Number(current.ar_current) || 0) / 1000).toFixed(1)}K
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">31-60 Days</div>
            <div className="text-xl font-semibold text-orange-600">
              ${((Number(current.ar_overdue_30) || 0) / 1000).toFixed(1)}K
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">61-90 Days</div>
            <div className="text-xl font-semibold text-red-600">
              ${((Number(current.ar_overdue_60) || 0) / 1000).toFixed(1)}K
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">90+ Days</div>
            <div className="text-xl font-semibold text-red-700">
              ${((Number(current.ar_overdue_90) || 0) / 1000).toFixed(1)}K
            </div>
          </div>
        </div>
      </div>

      {/* Overdue Alert */}
      {(Number(current.ar_overdue_90) || 0) > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">
                ${((Number(current.ar_overdue_90) || 0) / 1000).toFixed(1)}K in invoices overdue 90+ days
              </h3>
              <p className="text-sm text-red-800 mt-1">
                These invoices require immediate attention. Consider collections follow-up or payment plans.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cashflow Projections */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Cashflow Forecast
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-2">Next 30 Days</div>
            <div className="text-2xl font-bold text-gray-900 mb-1">
              ${((Number(projections.next_30_days?.projected_net) || 0) / 1000).toFixed(1)}K
            </div>
            <div className="text-sm text-gray-600">
              <div>In: ${((Number(projections.next_30_days?.projected_in) || 0) / 1000).toFixed(1)}K</div>
              <div>Out: ${((Number(projections.next_30_days?.projected_out) || 0) / 1000).toFixed(1)}K</div>
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-2">Next 60 Days</div>
            <div className="text-2xl font-bold text-gray-900 mb-1">
              ${((Number(projections.next_60_days?.projected_net) || 0) / 1000).toFixed(1)}K
            </div>
            <div className="text-sm text-gray-600">
              <div>In: ${((Number(projections.next_60_days?.projected_in) || 0) / 1000).toFixed(1)}K</div>
              <div>Out: ${((Number(projections.next_60_days?.projected_out) || 0) / 1000).toFixed(1)}K</div>
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-2">Next 90 Days</div>
            <div className="text-2xl font-bold text-gray-900 mb-1">
              ${((Number(projections.next_90_days?.projected_net) || 0) / 1000).toFixed(1)}K
            </div>
            <div className="text-sm text-gray-600">
              <div>In: ${((Number(projections.next_90_days?.projected_in) || 0) / 1000).toFixed(1)}K</div>
              <div>Out: ${((Number(projections.next_90_days?.projected_out) || 0) / 1000).toFixed(1)}K</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

























