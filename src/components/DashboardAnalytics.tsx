'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from 'recharts'
import { 
  Mail, 
  MailOpen, 
  MessageSquare, 
  TrendingUp, 
  Users, 
  Target,
  Calendar,
  Zap
} from 'lucide-react'

interface AnalyticsData {
  overview: {
    totalContacts: number
    totalCampaigns: number
    totalSequences: number
    totalTemplates: number
  }
  emailMetrics: {
    sent: number
    delivered: number
    opened: number
    clicked: number
    replied: number
    bounced: number
    unsubscribed: number
  }
  dailyStats: Array<{
    date: string
    sent: number
    opened: number
    replied: number
  }>
  campaignPerformance: Array<{
    name: string
    sent: number
    openRate: number
    replyRate: number
  }>
  topTemplates: Array<{
    name: string
    usage: number
    avgOpenRate: number
    avgReplyRate: number
  }>
  recentActivity: Array<{
    type: string
    description: string
    timestamp: string
    value?: number
  }>
}

export default function DashboardAnalytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d'>('30d')
  
  const supabase = createClientComponentClient()

  useEffect(() => {
    loadAnalytics()
  }, [timeframe])

  const loadAnalytics = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch analytics data
      const [
        overviewData,
        emailMetricsData,
        dailyStatsData,
        campaignPerformanceData,
        topTemplatesData,
        recentActivityData
      ] = await Promise.all([
        fetchOverview(user.id),
        fetchEmailMetrics(user.id, timeframe),
        fetchDailyStats(user.id, timeframe),
        fetchCampaignPerformance(user.id, timeframe),
        fetchTopTemplates(user.id, timeframe),
        fetchRecentActivity(user.id)
      ])

      setAnalytics({
        overview: overviewData,
        emailMetrics: emailMetricsData,
        dailyStats: dailyStatsData,
        campaignPerformance: campaignPerformanceData,
        topTemplates: topTemplatesData,
        recentActivity: recentActivityData
      })
    } catch (error) {
      console.error('Error loading analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchOverview = async (userId: string) => {
    const [contacts, campaigns, sequences, templates] = await Promise.all([
      supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('sequences').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('email_templates').select('*', { count: 'exact', head: true }).eq('user_id', userId)
    ])

    return {
      totalContacts: contacts.count || 0,
      totalCampaigns: campaigns.count || 0,
      totalSequences: sequences.count || 0,
      totalTemplates: templates.count || 0
    }
  }

  const fetchEmailMetrics = async (userId: string, timeframe: string) => {
    const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data: emails } = await supabase
      .from('email_send_logs')
      .select('status, created_at')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())

    if (!emails) return { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, unsubscribed: 0 }

    const metrics = {
      sent: emails.length,
      delivered: emails.filter(e => e.status !== 'bounced').length,
      opened: emails.filter(e => e.status === 'opened').length,
      clicked: emails.filter(e => e.status === 'clicked').length,
      replied: emails.filter(e => e.status === 'replied').length,
      bounced: emails.filter(e => e.status === 'bounced').length,
      unsubscribed: emails.filter(e => e.status === 'unsubscribed').length
    }

    return metrics
  }

  const fetchDailyStats = async (userId: string, timeframe: string) => {
    const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data: emails } = await supabase
      .from('email_send_logs')
      .select('status, created_at')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())

    if (!emails) return []

    // Group by date
    const dailyStats = emails.reduce((acc: Record<string, { date: string; sent: number; opened: number; replied: number }>, email) => {
      const date = new Date(email.created_at).toLocaleDateString()
      if (!acc[date]) {
        acc[date] = { date, sent: 0, opened: 0, replied: 0 }
      }
      acc[date].sent++
      if (email.status === 'opened') acc[date].opened++
      if (email.status === 'replied') acc[date].replied++
      return acc
    }, {})

    return Object.values(dailyStats)
  }

  const fetchCampaignPerformance = async (userId: string, timeframe: string) => {
    const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data: campaigns } = await supabase
      .from('campaigns')
      .select(`
        name,
        email_send_logs!inner(status, created_at)
      `)
      .eq('user_id', userId)
      .gte('email_send_logs.created_at', startDate.toISOString())

    if (!campaigns) return []

    return campaigns.map(campaign => {
      const emails = campaign.email_send_logs || []
      const sent = emails.length
      const opened = emails.filter(e => e.status === 'opened').length
      const replied = emails.filter(e => e.status === 'replied').length

      return {
        name: campaign.name,
        sent,
        openRate: sent > 0 ? (opened / sent) * 100 : 0,
        replyRate: sent > 0 ? (replied / sent) * 100 : 0
      }
    }).slice(0, 5) // Top 5 campaigns
  }

  const fetchTopTemplates = async (userId: string, timeframe: string) => {
    const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data: templates } = await supabase
      .from('email_templates')
      .select(`
        name,
        email_send_logs!inner(status, created_at)
      `)
      .eq('user_id', userId)
      .gte('email_send_logs.created_at', startDate.toISOString())

    if (!templates) return []

    return templates.map(template => {
      const emails = template.email_send_logs || []
      const usage = emails.length
      const opened = emails.filter(e => e.status === 'opened').length
      const replied = emails.filter(e => e.status === 'replied').length

      return {
        name: template.name,
        usage,
        avgOpenRate: usage > 0 ? (opened / usage) * 100 : 0,
        avgReplyRate: usage > 0 ? (replied / usage) * 100 : 0
      }
    }).slice(0, 5) // Top 5 templates
  }

  const fetchRecentActivity = async (userId: string) => {
    const { data: activities } = await supabase
      .from('usage_events')
      .select('feature, created_at, tokens')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (!activities) return []

    return activities.map(activity => ({
      type: activity.feature,
      description: getActivityDescription(activity.feature),
      timestamp: activity.created_at,
      value: activity.tokens
    }))
  }

  const getActivityDescription = (feature: string): string => {
    const descriptions: Record<string, string> = {
      'email_send': 'Email sent',
      'campaign_create': 'Campaign created',
      'template_create': 'Template created',
      'sequence_create': 'Sequence created',
      'ai_optimization': 'AI optimization used',
      'contact_import': 'Contacts imported'
    }
    return descriptions[feature] || 'Activity recorded'
  }

  const calculateRates = () => {
    if (!analytics?.emailMetrics) return {
      deliveryRate: 0,
      openRate: 0,
      replyRate: 0
    }
    
    const { sent, delivered, opened, replied } = analytics.emailMetrics
    
    return {
      deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
      openRate: sent > 0 ? (opened / sent) * 100 : 0,
      replyRate: sent > 0 ? (replied / sent) * 100 : 0
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!analytics) {
    return <div className="text-center text-gray-500">No analytics data available</div>
  }

  const rates = calculateRates()

  return (
    <div className="space-y-8">
      {/* Timeframe Selector */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h2>
        <div className="flex space-x-2">
          {(['7d', '30d', '90d'] as const).map((period) => (
            <button
              key={period}
              onClick={() => setTimeframe(period)}
              className={`px-3 py-1 rounded-lg text-sm font-medium ${
                timeframe === period
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {period === '7d' ? '7 Days' : period === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Contacts</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview.totalContacts.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Campaigns</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview.totalCampaigns}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <Target className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Email Sequences</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview.totalSequences}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <Zap className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Templates</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview.totalTemplates}</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-lg">
              <Mail className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Email Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Email Performance Chart */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Email Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics.dailyStats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="sent" fill="#3B82F6" name="Sent" />
              <Bar dataKey="opened" fill="#10B981" name="Opened" />
              <Bar dataKey="replied" fill="#F59E0B" name="Replied" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Key Metrics */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Metrics</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <Mail className="w-5 h-5 text-blue-600" />
                <span className="text-gray-700">Delivery Rate</span>
              </div>
              <span className="text-lg font-semibold text-gray-900">{rates.deliveryRate.toFixed(1)}%</span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <MailOpen className="w-5 h-5 text-green-600" />
                <span className="text-gray-700">Open Rate</span>
              </div>
              <span className="text-lg font-semibold text-gray-900">{rates.openRate.toFixed(1)}%</span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <MessageSquare className="w-5 h-5 text-yellow-600" />
                <span className="text-gray-700">Reply Rate</span>
              </div>
              <span className="text-lg font-semibold text-gray-900">{rates.replyRate.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Campaign Performance */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Campaigns</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-700">Campaign</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Emails Sent</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Open Rate</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Reply Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {analytics.campaignPerformance.map((campaign, index) => (
                <tr key={index}>
                  <td className="py-3 px-4 font-medium text-gray-900">{campaign.name}</td>
                  <td className="py-3 px-4 text-center text-gray-600">{campaign.sent}</td>
                  <td className="py-3 px-4 text-center text-gray-600">{campaign.openRate.toFixed(1)}%</td>
                  <td className="py-3 px-4 text-center text-gray-600">{campaign.replyRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {analytics.recentActivity.map((activity, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                <span className="text-gray-700">{activity.description}</span>
              </div>
              <div className="flex items-center space-x-3 text-sm text-gray-500">
                {activity.value && <span>{activity.value}</span>}
                <span>{new Date(activity.timestamp).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
} 