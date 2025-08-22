'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase'
import { 
  Activity, 
  Mail, 
  MessageSquare, 
  Users, 
  Calendar,
  User,
  Clock,
  Zap,
  Target,
  Package
} from 'lucide-react'
import { TeamActivity } from '@/types/database'

interface TeamActivityFeedProps {
  workspaceId: string
  limit?: number
}

export default function TeamActivityFeed({ workspaceId, limit = 20 }: TeamActivityFeedProps) {
  const [activities, setActivities] = useState<TeamActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  
  const supabase = createClientComponentClient()

  useEffect(() => {
    loadActivities()
    
    // Set up real-time subscription for new activities
    const channel = supabase
      .channel('team_activities')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_activities',
          filter: `workspace_id=eq.${workspaceId}`
        },
        (payload) => {
          setActivities(prev => [payload.new as TeamActivity, ...prev])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId])

  const loadActivities = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('team_activities')
        .select(`
          *,
          user:users(email)
        `)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('Error loading activities:', error)
      } else {
        setActivities(data || [])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatActivityAction = (action: string) => {
    const actionMap: Record<string, string> = {
      'added_comment': 'added a comment',
      'created_template': 'created a template',
      'edited_template': 'edited a template',
      'created_campaign': 'created a campaign',
      'approved_campaign': 'approved a campaign',
      'rejected_campaign': 'rejected a campaign',
      'sent_campaign': 'sent a campaign',
      'imported_contacts': 'imported contacts',
      'joined_team': 'joined the team',
      'left_team': 'left the team',
      'role_changed': 'had their role changed',
      'workspace_created': 'created the workspace',
      'settings_updated': 'updated workspace settings'
    }
    return actionMap[action] || action.replace('_', ' ')
  }

  const getActivityIcon = (entityType: string, action: string) => {
    switch (entityType) {
      case 'template':
        return <Mail className="h-5 w-5 text-blue-500" />
      case 'campaign':
        return <MessageSquare className="h-5 w-5 text-green-500" />
      case 'contacts':
        return <Users className="h-5 w-5 text-purple-500" />
      case 'workspace':
        return <Target className="h-5 w-5 text-orange-500" />
      case 'user':
        return <User className="h-5 w-5 text-indigo-500" />
      default:
        return <Activity className="h-5 w-5 text-gray-500" />
    }
  }

  const getActivityColor = (action: string) => {
    if (action.includes('approved') || action.includes('created')) {
      return 'text-green-600'
    } else if (action.includes('rejected') || action.includes('left')) {
      return 'text-red-600'
    } else if (action.includes('edited') || action.includes('updated')) {
      return 'text-blue-600'
    } else {
      return 'text-gray-600'
    }
  }

  const formatTimeAgo = (dateString: string) => {
    const now = new Date()
    const activityDate = new Date(dateString)
    const diffInSeconds = Math.floor((now.getTime() - activityDate.getTime()) / 1000)
    
    if (diffInSeconds < 60) {
      return 'Just now'
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60)
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600)
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`
    } else if (diffInSeconds < 2592000) {
      const days = Math.floor(diffInSeconds / 86400)
      return `${days} day${days !== 1 ? 's' : ''} ago`
    } else {
      return activityDate.toLocaleDateString()
    }
  }

  const getActivityDetails = (activity: TeamActivity) => {
    if (activity.details) {
      try {
        const details = typeof activity.details === 'string' 
          ? JSON.parse(activity.details) 
          : activity.details
        
        if (details.template_name) {
          return `"${details.template_name}"`
        } else if (details.campaign_name) {
          return `"${details.campaign_name}"`
        } else if (details.contact_count) {
          return `${details.contact_count} contacts`
        } else if (details.comment_length) {
          return `${details.comment_length} characters`
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const displayedActivities = showAll ? activities : activities.slice(0, limit)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Activity className="h-5 w-5 text-gray-400 mr-2" />
          <h3 className="text-lg font-medium text-gray-900">Team Activity</h3>
        </div>
        <div className="text-sm text-gray-500">
          {activities.length} activities
        </div>
      </div>

      {/* Activity List */}
      <div className="space-y-3">
        {displayedActivities.map((activity) => (
          <div key={activity.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-start space-x-3">
              {/* Activity Icon */}
              <div className="flex-shrink-0 mt-1">
                {getActivityIcon(activity.entity_type, activity.action)}
              </div>
              
              {/* Activity Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="font-medium text-gray-900">
                    {activity.user?.email || 'Unknown User'}
                  </span>
                  <span className={`text-sm ${getActivityColor(activity.action)}`}>
                    {formatActivityAction(activity.action)}
                  </span>
                  {activity.entity_type !== 'user' && (
                    <span className="text-sm text-gray-500">
                      on {activity.entity_type}
                    </span>
                  )}
                </div>
                
                {/* Activity Details */}
                {getActivityDetails(activity) && (
                  <p className="text-sm text-gray-700 mb-2">
                    {getActivityDetails(activity)}
                  </p>
                )}
                
                {/* Timestamp */}
                <div className="flex items-center text-xs text-gray-500">
                  <Clock className="h-3 w-3 mr-1" />
                  {formatTimeAgo(activity.created_at)}
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {activities.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <Activity className="h-12 w-12 text-gray-300 mx-auto mb-2" />
            <p>No team activity yet</p>
            <p className="text-sm">Activities will appear here as team members work</p>
          </div>
        )}
      </div>

      {/* Show More/Less Toggle */}
      {activities.length > limit && (
        <div className="text-center">
          <button
            onClick={() => setShowAll(!showAll)}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {showAll ? 'Show Less' : `Show ${activities.length - limit} More`}
          </button>
        </div>
      )}

      {/* Real-time Indicator */}
      <div className="flex items-center justify-center text-xs text-gray-500">
        <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
        Live updates enabled
      </div>
    </div>
  )
} 