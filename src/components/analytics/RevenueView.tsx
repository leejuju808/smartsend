/**
 * Block 23870 — SmartSend Roofing Analytics Revenue View
 * Estimated Revenue Engine — The Secret Retention Booster
 */

'use client'

import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, Calendar, Users } from 'lucide-react'

interface RevenueData {
  hotLeads: {
    count: number
    totalValue: number
    leads: Array<{
      id: string
      email: string
      name: string | null
      estimatedValue: number
    }>
  }
  warmLeads: {
    count: number
    totalValue: number
    leads: Array<{
      id: string
      email: string
      name: string | null
      estimatedValue: number
    }>
  }
  totalProjectedValue: number
  bookedEstimates: number
  averageTicketPrice: number
}

export default function RevenueView() {
  const [revenue, setRevenue] = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRevenue()
  }, [])

  const loadRevenue = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/analytics/revenue')
      const data = await response.json()

      if (data.success) {
        setRevenue(data.revenue)
      }
    } catch (error) {
      console.error('Error loading revenue:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!revenue) {
    return <div className="text-center text-gray-500 py-12">No revenue data available</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Estimated Revenue</h2>
        <p className="text-sm text-gray-500">
          Based on {revenue.averageTicketPrice.toLocaleString()} average ticket
        </p>
      </div>

      {/* Total Projected Value - THE BIG NUMBER */}
      <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-8 text-white">
        <div className="flex items-center gap-3 mb-2">
          <DollarSign className="w-8 h-8" />
          <h3 className="text-lg font-medium opacity-90">Total Projected Value</h3>
        </div>
        <p className="text-5xl font-bold mb-2">{formatCurrency(revenue.totalProjectedValue)}</p>
        <p className="text-green-100 text-sm">
          This is the money SmartSend is generating for you
        </p>
      </div>

      {/* Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Hot Leads */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-100 rounded-lg">
              <Users className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Hot Leads</h3>
              <p className="text-sm text-gray-500">{revenue.hotLeads.count} leads</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-3xl font-bold text-red-600">
              {formatCurrency(revenue.hotLeads.totalValue)}
            </p>
            <p className="text-sm text-gray-600">
              100% conversion probability • Call these TODAY
            </p>
          </div>

          {/* Top Hot Leads */}
          {revenue.hotLeads.leads.length > 0 && (
            <div className="mt-6 space-y-2">
              <p className="text-sm font-medium text-gray-700 mb-2">Top Hot Leads:</p>
              {revenue.hotLeads.leads.slice(0, 5).map((lead) => (
                <div key={lead.id} className="flex items-center justify-between p-2 bg-red-50 rounded">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {lead.name || lead.email}
                    </p>
                    <p className="text-xs text-gray-500">{lead.email}</p>
                  </div>
                  <p className="text-sm font-semibold text-red-600">
                    {formatCurrency(lead.estimatedValue)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Warm Leads */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Users className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Warm Leads</h3>
              <p className="text-sm text-gray-500">{revenue.warmLeads.count} leads</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-3xl font-bold text-yellow-600">
              {formatCurrency(revenue.warmLeads.totalValue)}
            </p>
            <p className="text-sm text-gray-600">
              25% conversion probability • Follow up this week
            </p>
          </div>

          {/* Top Warm Leads */}
          {revenue.warmLeads.leads.length > 0 && (
            <div className="mt-6 space-y-2">
              <p className="text-sm font-medium text-gray-700 mb-2">Top Warm Leads:</p>
              {revenue.warmLeads.leads.slice(0, 5).map((lead) => (
                <div key={lead.id} className="flex items-center justify-between p-2 bg-yellow-50 rounded">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {lead.name || lead.email}
                    </p>
                    <p className="text-xs text-gray-500">{lead.email}</p>
                  </div>
                  <p className="text-sm font-semibold text-yellow-600">
                    {formatCurrency(lead.estimatedValue)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Booked Estimates */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-green-100 rounded-lg">
            <Calendar className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Booked Estimates</h3>
            <p className="text-sm text-gray-500">Actual scheduled appointments</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-3xl font-bold text-gray-900">{revenue.bookedEstimates}</p>
          <div className="flex items-center gap-2 text-green-600">
            <TrendingUp className="w-5 h-5" />
            <span className="text-sm font-medium">This is revenue in motion</span>
          </div>
        </div>
      </div>

      {/* Retention Message */}
      <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
        <p className="text-sm text-blue-900">
          <strong>💡 Why this matters:</strong> When roofers see SmartSend generating tens of thousands 
          in estimated revenue, they will NEVER cancel. This is your retention booster.
        </p>
      </div>
    </div>
  )
}






































