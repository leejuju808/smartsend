/**
 * Block 23870 — SmartSend Roofing Analytics Insights View
 * Secondary Metrics & AI-Generated Insights
 */

'use client'

import { useState, useEffect } from 'react'
import { 
  TrendingUp, 
  TrendingDown,
  AlertCircle,
  CheckCircle,
  X,
  ExternalLink
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'

interface InsightsData {
  openRateTrend: Array<{
    date: string
    openRate: number
    replyRate: number
    emailsSent: number
    emailsOpened: number
  }>
  replyTypeBreakdown: {
    hotLeads: number
    warmLeads: number
    questions: number
    notInterested: number
  }
  bestCampaign: {
    id: string
    name: string
    subject: string
    replyRate: number
  } | null
  underperformingCampaigns: Array<{
    id: string
    name: string
    issue: string
    openRate: number
    replyRate: number
  }>
  seasonalOpportunities: Array<{
    type: string
    message: string
    priority: 'low' | 'medium' | 'high'
  }>
  aiInsights: Array<{
    id: string
    insight_type: string
    title: string
    message: string
    priority: string
    created_at: string
  }>
}

export default function InsightsView() {
  const [insights, setInsights] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'7d' | '30d'>('30d')
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadInsights()
  }, [period])

  const loadInsights = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/analytics/insights?period=${period}`)
      const data = await response.json()

      if (data.success) {
        setInsights(data.insights)
      }
    } catch (error) {
      console.error('Error loading insights:', error)
    } finally {
      setLoading(false)
    }
  }

  const dismissInsight = async (insightId: string) => {
    try {
      await fetch('/api/analytics/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insightId, action: 'dismiss' })
      })
      setDismissedInsights(prev => new Set([...prev, insightId]))
    } catch (error) {
      console.error('Error dismissing insight:', error)
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'border-red-500 bg-red-50'
      case 'high': return 'border-orange-500 bg-orange-50'
      case 'medium': return 'border-blue-500 bg-blue-50'
      default: return 'border-gray-300 bg-gray-50'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!insights) {
    return <div className="text-center text-gray-500 py-12">No insights available</div>
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Insights</h2>
        <div className="flex space-x-2">
          {(['7d', '30d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                period === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {p === '7d' ? '7 Days' : '30 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* AI-Generated Insights */}
      {insights.aiInsights.filter(i => !dismissedInsights.has(i.id)).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-900">Smart Insights</h3>
          {insights.aiInsights
            .filter(i => !dismissedInsights.has(i.id))
            .map((insight) => (
              <div
                key={insight.id}
                className={`border-l-4 rounded-lg p-4 ${getPriorityColor(insight.priority)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">{insight.title}</h4>
                    <p className="text-gray-700">{insight.message}</p>
                  </div>
                  <button
                    onClick={() => dismissInsight(insight.id)}
                    className="ml-4 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Open Rate Trend */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Open Rate Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={insights.openRateTrend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            />
            <YAxis />
            <Tooltip />
            <Line 
              type="monotone" 
              dataKey="openRate" 
              stroke="#3B82F6" 
              strokeWidth={2}
              name="Open Rate %"
            />
            <Line 
              type="monotone" 
              dataKey="replyRate" 
              stroke="#10B981" 
              strokeWidth={2}
              name="Reply Rate %"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Reply Type Breakdown */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Reply Type Breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-3xl font-bold text-red-600">{insights.replyTypeBreakdown.hotLeads}</p>
            <p className="text-sm text-gray-600 mt-1">Hot Leads</p>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <p className="text-3xl font-bold text-yellow-600">{insights.replyTypeBreakdown.warmLeads}</p>
            <p className="text-sm text-gray-600 mt-1">Warm Leads</p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-3xl font-bold text-blue-600">{insights.replyTypeBreakdown.questions}</p>
            <p className="text-sm text-gray-600 mt-1">Questions</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-3xl font-bold text-gray-600">{insights.replyTypeBreakdown.notInterested}</p>
            <p className="text-sm text-gray-600 mt-1">Not Interested</p>
          </div>
        </div>
      </div>

      {/* Best Campaign */}
      {insights.bestCampaign && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 border-green-500">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Best Campaign This Month</h3>
          </div>
          <div className="space-y-2">
            <p className="text-xl font-bold text-gray-900">{insights.bestCampaign.name}</p>
            <p className="text-sm text-gray-600">{insights.bestCampaign.subject}</p>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-600">
                {insights.bestCampaign.replyRate}% reply rate
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-2">Use this campaign again for better results</p>
          </div>
        </div>
      )}

      {/* Underperforming Campaigns */}
      {insights.underperformingCampaigns.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <h3 className="text-lg font-semibold text-gray-900">Campaigns Needing Attention</h3>
          </div>
          <div className="space-y-3">
            {insights.underperformingCampaigns.map((campaign) => (
              <div key={campaign.id} className="p-4 bg-red-50 rounded-lg border border-red-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{campaign.name}</p>
                    <p className="text-sm text-red-600 mt-1">{campaign.issue}</p>
                    <div className="flex gap-4 mt-2 text-sm text-gray-600">
                      <span>Open: {campaign.openRate}%</span>
                      <span>Reply: {campaign.replyRate}%</span>
                    </div>
                  </div>
                  <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                    Fix →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seasonal Opportunities */}
      {insights.seasonalOpportunities.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Seasonal Opportunities</h3>
          <div className="space-y-2">
            {insights.seasonalOpportunities.map((opp, idx) => (
              <div key={idx} className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-gray-900">{opp.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}






































