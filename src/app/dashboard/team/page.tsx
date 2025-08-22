'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { 
  Users, 
  UserPlus, 
  Activity, 
  Crown, 
  Shield, 
  User,
  MessageSquare,
  Calendar,
  Mail,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react'
import { WorkspaceMember, TeamActivity } from '@/types/database'
import { canManageMembers, canInviteMembers, canViewTeamActivity } from '@/utils/permissions'
import InviteMemberForm from '@/components/team/InviteMemberForm'

export default function TeamDashboard() {
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [activities, setActivities] = useState<TeamActivity[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null)
  const [myRole, setMyRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showInviteForm, setShowInviteForm] = useState(false)
  
  const supabase = createClientComponentClient()
  const router = useRouter()

  useEffect(() => {
    const loadTeamData = async () => {
      try {
        const active = localStorage.getItem('active_workspace')
        if (!active) {
          router.push('/dashboard')
          return
        }

        setActiveWorkspace(active)

        // Load user's role
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: membership } = await supabase
            .from('workspace_members')
            .select('role')
            .eq('workspace_id', active)
            .eq('user_id', user.id)
            .single()
          
          setMyRole(membership?.role || null)
        }

        // Load team members
        const { data: membersData } = await supabase
          .from('workspace_members')
          .select(`
            *,
            user:users(email)
          `)
          .eq('workspace_id', active)
          .order('created_at', { ascending: true })

        if (membersData) {
          setMembers(membersData)
        }

        // Load team activities
        const { data: activitiesData } = await supabase
          .from('team_activities')
          .select(`
            *,
            user:users(email)
          `)
          .eq('workspace_id', active)
          .order('created_at', { ascending: false })
          .limit(20)

        if (activitiesData) {
          setActivities(activitiesData)
        }

      } catch (error) {
        console.error('Error loading team data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadTeamData()
  }, [supabase, router])

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="h-4 w-4 text-yellow-500" />
      case 'admin':
        return <Shield className="h-4 w-4 text-blue-500" />
      case 'member':
        return <User className="h-4 w-4 text-gray-500" />
      default:
        return <User className="h-4 w-4 text-gray-500" />
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-yellow-100 text-yellow-800'
      case 'admin':
        return 'bg-blue-100 text-blue-800'
      case 'member':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
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
      'imported_contacts': 'imported contacts'
    }
    return actionMap[action] || action
  }

  const getActivityIcon = (entityType: string) => {
    switch (entityType) {
      case 'template':
        return <Mail className="h-4 w-4 text-blue-500" />
      case 'campaign':
        return <MessageSquare className="h-4 w-4 text-green-500" />
      case 'contacts':
        return <Users className="h-4 w-4 text-purple-500" />
      default:
        return <Activity className="h-4 w-4 text-gray-500" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Dashboard</h1>
          <p className="text-gray-600">Manage your team and track collaboration</p>
        </div>
        {canInviteMembers(myRole) && (
          <button
            onClick={() => setShowInviteForm(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Member
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Members */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Users className="h-5 w-5 text-gray-400 mr-2" />
            <h2 className="text-lg font-medium text-gray-900">Team Members</h2>
            <span className="ml-auto text-sm text-gray-500">{members.length} members</span>
          </div>
          
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div className="flex items-center">
                  <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center mr-3">
                    <span className="text-sm font-medium text-white">
                      {member.user?.email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{member.user?.email}</p>
                    <div className="flex items-center mt-1">
                      {getRoleIcon(member.role)}
                      <span className={`ml-1 text-xs px-2 py-1 rounded-full ${getRoleBadgeColor(member.role)}`}>
                        {member.role}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  Joined {new Date(member.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Activity className="h-5 w-5 text-gray-400 mr-2" />
            <h2 className="text-lg font-medium text-gray-900">Recent Activity</h2>
          </div>
          
          <div className="space-y-3">
            {activities.slice(0, 8).map((activity) => (
              <div key={activity.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-md">
                <div className="flex-shrink-0 mt-1">
                  {getActivityIcon(activity.entity_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{activity.user?.email}</span>
                    {' '}{formatActivityAction(activity.action)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(activity.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
            
            {activities.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                No recent activity
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Team Stats */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Team Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{members.length}</div>
            <div className="text-sm text-gray-500">Total Members</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {members.filter(m => m.role === 'admin' || m.role === 'owner').length}
            </div>
            <div className="text-sm text-gray-500">Admins</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {members.filter(m => m.role === 'member').length}
            </div>
            <div className="text-sm text-gray-500">Members</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{activities.length}</div>
            <div className="text-sm text-gray-500">Activities</div>
          </div>
        </div>
      </div>

      {/* Invite Member Modal */}
      {showInviteForm && (
        <InviteMemberForm
          workspaceId={activeWorkspace!}
          onClose={() => setShowInviteForm(false)}
          onSuccess={(newMember) => {
            setMembers([...members, newMember])
            setShowInviteForm(false)
          }}
        />
      )}
    </div>
  )
} 