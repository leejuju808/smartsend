'use client'

import { useState, useEffect } from 'react'
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
  MousePointer, 
  TrendingUp, 
  Users, 
  Target,
  Calendar,
  Zap,
  AlertTriangle
} from 'lucide-react'
import { Button } from "@/components/ui/Button";
import { EventDrawer } from "@/components/analytics/EventDrawer";

interface AnalyticsData {
  range: {
    from: string;
    to: string;
  };
  totals: {
    sent: number;
    opened: number;
    clicked: number;
    bounced: number;
    open_rate: number;
    click_rate: number;
  };
  time_buckets: Array<{
    date: string;
    sent: number;
    opened: number;
    clicked: number;
    bounced: number;
  }>;
  campaigns: Array<{
    campaign_id: string;
    campaign_name: string;
    sent: number;
    opened: number;
    clicked: number;
    open_rate: number;
    click_rate: number;
  }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

export default function SmartSendAnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d'>('30d')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerCampaign, setDrawerCampaign] = useState<string | undefined>()

  useEffect(() => {
    fetchAnalytics()
  }, [timeframe])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90
      const response = await fetch(`/api/analytics/dashboard?days=${days}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch analytics')
      }
      
      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <p className="text-red-600">{error || 'Failed to load analytics data'}</p>
        <button 
          onClick={fetchAnalytics}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    )
  }

  const { totals, time_buckets, campaigns } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-600">Smart Send Campaign Performance</p>
        </div>
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as const).map((period) => (
            <button
              key={period}
              onClick={() => setTimeframe(period)}
              className={`px-3 py-1 rounded text-sm font-medium ${
                timeframe === period
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center">
            <Mail className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Sent</p>
              <p className="text-2xl font-bold text-gray-900">{totals.sent.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center">
            <MailOpen className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Opened</p>
              <p className="text-2xl font-bold text-gray-900">{totals.opened.toLocaleString()}</p>
              <p className="text-sm text-green-600">{totals.open_rate}% open rate</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center">
            <MousePointer className="h-8 w-8 text-purple-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Clicked</p>
              <p className="text-2xl font-bold text-gray-900">{totals.clicked.toLocaleString()}</p>
              <p className="text-sm text-purple-600">{totals.click_rate}% click rate</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center">
            <AlertTriangle className="h-8 w-8 text-red-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Bounced</p>
              <p className="text-2xl font-bold text-gray-900">{totals.bounced.toLocaleString()}</p>
              <p className="text-sm text-red-600">
                {totals.sent > 0 ? ((totals.bounced / totals.sent) * 100).toFixed(1) : 0}% bounce rate
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Time Series Chart */}
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Email Activity Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={time_buckets}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => new Date(value).toLocaleDateString()}
              />
              <YAxis />
              <Tooltip 
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
                formatter={(value, name) => [value.toLocaleString(), name]}
              />
              <Area type="monotone" dataKey="sent" stackId="1" stroke="#0088FE" fill="#0088FE" fillOpacity={0.6} />
              <Area type="monotone" dataKey="opened" stackId="1" stroke="#00C49F" fill="#00C49F" fillOpacity={0.6} />
              <Area type="monotone" dataKey="clicked" stackId="1" stroke="#FFBB28" fill="#FFBB28" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Campaign Performance */}
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Campaign Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={campaigns}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="campaign_name" />
              <YAxis />
              <Tooltip formatter={(value, name) => [value.toLocaleString(), name]} />
              <Bar dataKey="sent" fill="#0088FE" name="Sent" />
              <Bar dataKey="opened" fill="#00C49F" name="Opened" />
              <Bar dataKey="clicked" fill="#FFBB28" name="Clicked" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Campaign Details Table */}
      <div className="bg-white rounded-lg shadow border">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Campaign Details</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Campaign
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Opened
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Clicked
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Open Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Click Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {campaigns.map((campaign) => (
                <tr key={campaign.campaign_id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {campaign.campaign_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {campaign.sent.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {campaign.opened.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {campaign.clicked.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      campaign.open_rate >= 50 ? 'bg-green-100 text-green-800' :
                      campaign.open_rate >= 30 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {campaign.open_rate}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      campaign.click_rate >= 10 ? 'bg-green-100 text-green-800' :
                      campaign.click_rate >= 5 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {campaign.click_rate}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <Button 
                      variant="outline"
                      onClick={() => {
                        setDrawerCampaign(campaign.campaign_id);
                        setDrawerOpen(true);
                      }}
                    >
                      View events
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <EventDrawer 
        open={drawerOpen} 
        onOpenChange={setDrawerOpen} 
        campaignId={drawerCampaign} 
      />
    </div>
  )
}