/**
 * Block 23870 — SmartSend Roofing Analytics Dashboard
 * The ONLY metrics that matter to roofers
 */

'use client'

import { useState, useEffect } from 'react'
import { 
  MessageSquare, 
  Users, 
  Calendar, 
  DollarSign, 
  TrendingUp,
  Activity,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'

interface DashboardMetrics {
  repliesReceived: number
  leadsCreated: number
  bookedEstimates: number
  estimatedJobValue: number
  campaignPerformanceScore: 'A' | 'B' | 'C' | 'D'
  activityTimeline: Array<{
    type: string
    subtype?: string | null
    message: string
    timestamp: string
    metadata?: Record<string, any>
  }>
}

interface Breakdown {
  hotLeads: number
  warmLeads: number
  questions: number
  notInterested: number
}

export default function RoofingDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'all_time' | '7d' | '30d' | '90d'>('all_time')

  useEffect(() => {
    loadMetrics()
  }, [period])

  const loadMetrics = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/analytics/dashboard?period=${period}`)
      const data = await response.json()

      if (data.success) {
        setMetrics(data.metrics)
        setBreakdown(data.breakdown)
      }
    } catch (error) {
      console.error('Error loading metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'text-green-600 bg-green-100'
      case 'B': return 'text-blue-600 bg-blue-100'
      case 'C': return 'text-yellow-600 bg-yellow-100'
      case 'D': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
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

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="text-center text-gray-500 py-12">
        <p>No analytics data available</p>
        <button 
          onClick={loadMetrics}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex space-x-2">
          {(['all_time', '7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {p === 'all_time' ? 'All Time' : p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Core 6 Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Metric 1: Replies Received */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <MessageSquare className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Replies</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-gray-900">{metrics.repliesReceived.toLocaleString()}</p>
            <p className="text-sm text-gray-600">Total replies across all campaigns</p>
          </div>
        </div>

        {/* Metric 2: Leads Created */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <Users className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">Leads</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-gray-900">{metrics.leadsCreated.toLocaleString()}</p>
            <p className="text-sm text-gray-600">HOT + WARM leads created</p>
            {breakdown && (
              <div className="flex gap-2 mt-2 text-xs">
                <span className="text-red-600 font-medium">{breakdown.hotLeads} HOT</span>
                <span className="text-gray-400">•</span>
                <span className="text-yellow-600 font-medium">{breakdown.warmLeads} WARM</span>
              </div>
            )}
          </div>
        </div>

        {/* Metric 3: Booked Estimates */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Calendar className="w-6 h-6 text-purple-600" />
            </div>
            <span className="text-sm text-gray-500">Booked</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-gray-900">{metrics.bookedEstimates.toLocaleString()}</p>
            <p className="text-sm text-gray-600">Estimates scheduled</p>
          </div>
        </div>

        {/* Metric 4: Estimated Job Value */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-yellow-600" />
            </div>
            <span className="text-sm text-gray-500">Revenue</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(metrics.estimatedJobValue)}</p>
            <p className="text-sm text-gray-600">Estimated job value</p>
          </div>
        </div>

        {/* Metric 5: Campaign Performance Score */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className={`p-3 rounded-lg ${getGradeColor(metrics.campaignPerformanceScore)}`}>
              <TrendingUp className="w-6 h-6" />
            </div>
            <span className="text-sm text-gray-500">Performance</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className={`text-3xl font-bold ${getGradeColor(metrics.campaignPerformanceScore).split(' ')[0]}`}>
                {metrics.campaignPerformanceScore}
              </p>
            </div>
            <p className="text-sm text-gray-600">Campaign grade</p>
          </div>
        </div>

        {/* Metric 6: Activity Timeline Preview */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-gray-100 rounded-lg">
              <Activity className="w-6 h-6 text-gray-600" />
            </div>
            <span className="text-sm text-gray-500">Activity</span>
          </div>
          <div className="space-y-2">
            {metrics.activityTimeline.slice(0, 3).map((activity, idx) => (
              <div key={idx} className="text-sm">
                <p className="text-gray-900 font-medium truncate">{activity.message}</p>
                <p className="text-gray-500 text-xs">{formatTimestamp(activity.timestamp)}</p>
              </div>
            ))}
            {metrics.activityTimeline.length > 3 && (
              <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                View all activity →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats Bar */}
      {breakdown && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{breakdown.hotLeads}</p>
              <p className="text-sm text-gray-600">Hot Leads</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">{breakdown.warmLeads}</p>
              <p className="text-sm text-gray-600">Warm Leads</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{breakdown.questions}</p>
              <p className="text-sm text-gray-600">Questions</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-600">{breakdown.notInterested}</p>
              <p className="text-sm text-gray-600">Not Interested</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}






































