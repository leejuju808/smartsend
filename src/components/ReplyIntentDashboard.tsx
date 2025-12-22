"use client"

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'
import { 
  Calendar, 
  MessageSquare, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Download,
  Eye
} from 'lucide-react'

interface ReplyIntentAnalytics {
  total_replies: number
  high_confidence_meetings: number
  human_review_needed: number
  no_intent: number
  avg_confidence: number
}

interface MeetingInvite {
  id: string
  summary: string
  attendee_name: string
  attendee_email: string
  start_time: string
  status: string
  created_at: string
}

export default function ReplyIntentDashboard() {
  const supabase = createClientComponentClient()
  const [analytics, setAnalytics] = useState<ReplyIntentAnalytics | null>(null)
  const [recentMeetings, setRecentMeetings] = useState<MeetingInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)

  useEffect(() => {
    const active = typeof window !== 'undefined' ? localStorage.getItem('active_workspace') : null
    setWorkspaceId(active)
  }, [])

  useEffect(() => {
    const loadData = async () => {
      if (!workspaceId) { setLoading(false); return }
      
      try {
        // Get reply intent analytics
        const { data: analyticsData } = await supabase
          .rpc('get_reply_intent_analytics', { p_owner: workspaceId, p_days: 30 })
        
        if (analyticsData && analyticsData.length > 0) {
          setAnalytics(analyticsData[0])
        }

        // Get recent meeting invites
        const { data: meetingsData } = await supabase
          .from('meeting_invites')
          .select(`
            *,
            campaign_contacts!inner(
              campaigns!inner(owner)
            )
          `)
          .eq('campaign_contacts.campaigns.owner', workspaceId)
          .order('created_at', { ascending: false })
          .limit(5)

        if (meetingsData) {
          setRecentMeetings(meetingsData)
        }
      } catch (error) {
        console.error('Error loading reply intent data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [supabase, workspaceId])

  const downloadICS = async (meetingId: string) => {
    try {
      const response = await fetch(`/api/replies/download-ics/${meetingId}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `meeting-invite.ics`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Error downloading ICS:', error)
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-32 bg-gray-200 rounded-lg"></div>
        <div className="h-64 bg-gray-200 rounded-lg"></div>
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="text-center py-8">
        <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No reply data yet</h3>
        <p className="mt-1 text-sm text-gray-500">
          Start sending campaigns to see reply intent analytics.
        </p>
      </div>
    )
  }

  const mb100 = analytics.total_replies > 0 
    ? ((analytics.high_confidence_meetings / analytics.total_replies) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="space-y-6">
      {/* MB/100 Metric Card */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Meetings Booked per 100 Replies</h3>
            <p className="text-sm text-gray-500">Your key performance metric</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-blue-600">{mb100}</div>
            <div className="text-sm text-gray-500">MB/100</div>
          </div>
        </div>
        
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-semibold text-gray-900">{analytics.total_replies}</div>
            <div className="text-sm text-gray-500">Total Replies</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-green-600">{analytics.high_confidence_meetings}</div>
            <div className="text-sm text-gray-500">Meetings Booked</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-gray-900">{analytics.avg_confidence.toFixed(0)}%</div>
            <div className="text-sm text-gray-500">Avg Confidence</div>
          </div>
        </div>
      </div>

      {/* Reply Intent Breakdown */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Reply Intent Analysis</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-green-600 mr-3" />
              <div>
                <div className="font-medium text-green-900">High Confidence</div>
                <div className="text-sm text-green-700">ICS generated automatically</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-green-600">{analytics.high_confidence_meetings}</div>
              <div className="text-sm text-green-600">
                {analytics.total_replies > 0 ? ((analytics.high_confidence_meetings / analytics.total_replies) * 100).toFixed(1) : '0'}%
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-yellow-600 mr-3" />
              <div>
                <div className="font-medium text-yellow-900">Human Review Needed</div>
                <div className="text-sm text-yellow-700">Potential meeting intent detected</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-yellow-600">{analytics.human_review_needed}</div>
              <div className="text-sm text-yellow-600">
                {analytics.total_replies > 0 ? ((analytics.human_review_needed / analytics.total_replies) * 100).toFixed(1) : '0'}%
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center">
              <MessageSquare className="h-5 w-5 text-gray-600 mr-3" />
              <div>
                <div className="font-medium text-gray-900">No Meeting Intent</div>
                <div className="text-sm text-gray-700">General replies or questions</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-gray-600">{analytics.no_intent}</div>
              <div className="text-sm text-gray-600">
                {analytics.total_replies > 0 ? ((analytics.no_intent / analytics.total_replies) * 100).toFixed(1) : '0'}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Meeting Invites */}
      {recentMeetings.length > 0 && (
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Meeting Invites</h3>
          
          <div className="space-y-3">
            {recentMeetings.map((meeting) => (
              <div key={meeting.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{meeting.summary}</div>
                  <div className="text-sm text-gray-500">
                    {meeting.attendee_name} ({meeting.attendee_email})
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(meeting.start_time).toLocaleDateString()} at{' '}
                    {new Date(meeting.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    meeting.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    meeting.status === 'accepted' ? 'bg-green-100 text-green-800' :
                    meeting.status === 'declined' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {meeting.status}
                  </span>
                  
                  <button
                    onClick={() => downloadICS(meeting.id)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                    title="Download ICS"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
} 