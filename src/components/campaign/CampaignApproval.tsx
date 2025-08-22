'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase'
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  MessageSquare, 
  User, 
  Calendar,
  Target,
  Package,
  Shield
} from 'lucide-react'
import { Campaign } from '@/types/database'
import { canApproveCampaigns } from '@/utils/permissions'

interface CampaignApprovalProps {
  workspaceId: string
  userRole: string | null
}

export default function CampaignApproval({ workspaceId, userRole }: CampaignApprovalProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  
  const supabase = createClientComponentClient()

  useEffect(() => {
    loadCampaigns()
  }, [workspaceId])

  const loadCampaigns = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select(`
          *,
          user:users(email)
        `)
        .eq('workspace_id', workspaceId)
        .in('approval_status', ['draft', 'pending_approval'])
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading campaigns:', error)
      } else {
        setCampaigns(data || [])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApproval = async (campaignId: string, status: 'approved' | 'rejected') => {
    if (status === 'approved') {
      setApproving(campaignId)
    } else {
      setRejecting(campaignId)
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('campaigns')
        .update({
          approval_status: status,
          approved_by: user.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', campaignId)

      if (error) {
        console.error('Error updating campaign:', error)
      } else {
        // Update local state
        setCampaigns(campaigns.map(campaign => 
          campaign.id === campaignId 
            ? { ...campaign, approval_status: status, approved_by: user.id, approved_at: new Date().toISOString() }
            : campaign
        ))

        // Log team activity
        await supabase.rpc('log_team_activity', {
          p_workspace_id: workspaceId,
          p_action: status === 'approved' ? 'approved_campaign' : 'rejected_campaign',
          p_entity_type: 'campaign',
          p_entity_id: campaignId
        })
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setApproving(null)
      setRejecting(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800'
      case 'pending_approval':
        return 'bg-yellow-100 text-yellow-800'
      case 'approved':
        return 'bg-green-100 text-green-800'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft':
        return <Clock className="h-4 w-4 text-gray-500" />
      case 'pending_approval':
        return <Clock className="h-4 w-4 text-yellow-500" />
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-500" />
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  if (!canApproveCampaigns(userRole)) {
    return (
      <div className="text-center text-gray-500 py-12">
        <Shield className="h-12 w-12 text-gray-300 mx-auto mb-2" />
        <p>You don't have permission to approve campaigns</p>
        <p className="text-sm">Only admins and owners can approve campaigns</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const pendingCampaigns = campaigns.filter(c => c.approval_status === 'pending_approval')
  const draftCampaigns = campaigns.filter(c => c.approval_status === 'draft')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Campaign Approval</h2>
          <p className="text-gray-600">Review and approve campaigns from your team</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{pendingCampaigns.length}</div>
            <div className="text-sm text-gray-500">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-600">{draftCampaigns.length}</div>
            <div className="text-sm text-gray-500">Drafts</div>
          </div>
        </div>
      </div>

      {/* Pending Approval */}
      {pendingCampaigns.length > 0 && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Pending Approval</h3>
            <p className="text-sm text-gray-500">Campaigns waiting for your review</p>
          </div>
          <div className="divide-y divide-gray-200">
            {pendingCampaigns.map((campaign) => (
              <div key={campaign.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-lg font-medium text-gray-900">{campaign.name}</h4>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(campaign.approval_status || 'draft')}`}>
                        {getStatusIcon(campaign.approval_status || 'draft')}
                        <span className="ml-1">{(campaign.approval_status || 'draft').replace('_', ' ')}</span>
                      </span>
                    </div>
                    
                                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600 mb-4">
                       <div className="flex items-center">
                         <User className="h-4 w-4 mr-2" />
                         {campaign.user?.email || 'Unknown User'}
                       </div>
                       <div className="flex items-center">
                         <Calendar className="h-4 w-4 mr-2" />
                         Created {campaign.created_at ? formatDate(campaign.created_at) : 'Unknown Date'}
                       </div>
                       <div className="flex items-center">
                         <MessageSquare className="h-4 w-4 mr-2" />
                         Campaign
                       </div>
                     </div>
                  </div>
                  
                  <div className="flex items-center space-x-3 ml-6">
                    <button
                      onClick={() => handleApproval(campaign.id, 'approved')}
                      disabled={approving === campaign.id}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                    >
                      {approving === campaign.id ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Approving...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </>
                      )}
                    </button>
                    
                    <button
                      onClick={() => handleApproval(campaign.id, 'rejected')}
                      disabled={rejecting === campaign.id}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                    >
                      {rejecting === campaign.id ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Rejecting...
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Draft Campaigns */}
      {draftCampaigns.length > 0 && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Draft Campaigns</h3>
            <p className="text-sm text-gray-500">Campaigns still being worked on</p>
          </div>
          <div className="divide-y divide-gray-200">
            {draftCampaigns.map((campaign) => (
              <div key={campaign.id} className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-lg font-medium text-gray-900">{campaign.name}</h4>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(campaign.approval_status || 'draft')}`}>
                        {getStatusIcon(campaign.approval_status || 'draft')}
                        <span className="ml-1">{campaign.approval_status || 'draft'}</span>
                      </span>
                    </div>
                    
                                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                       <div className="flex items-center">
                         <User className="h-4 w-4 mr-2" />
                         {campaign.user?.email || 'Unknown User'}
                       </div>
                       <div className="flex items-center">
                         <Calendar className="h-4 w-4 mr-2" />
                         Created {campaign.created_at ? formatDate(campaign.created_at) : 'Unknown Date'}
                       </div>
                       <div className="flex items-center">
                         <MessageSquare className="h-4 w-4 mr-2" />
                         Campaign
                       </div>
                     </div>
                  </div>
                  
                  <div className="ml-6">
                    <span className="text-sm text-gray-500">Waiting for submission</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {campaigns.length === 0 && (
        <div className="text-center text-gray-500 py-12">
          <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-2" />
          <p>No campaigns to review</p>
          <p className="text-sm">Campaigns will appear here when team members submit them for approval</p>
        </div>
      )}
    </div>
  )
} 