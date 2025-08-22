'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'
import { Campaign } from '@/types/database'
import { canApproveCampaigns } from '@/utils/permissions'

interface CampaignApprovalProps {
  campaign: Campaign
  userRole: string | null
  onApprovalUpdate: (campaign: Campaign) => void
}

export default function CampaignApproval({ campaign, userRole, onApprovalUpdate }: CampaignApprovalProps) {
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [feedback, setFeedback] = useState('')
  const [loading, setLoading] = useState(false)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'pending_approval':
        return <Clock className="h-5 w-5 text-yellow-500" />
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      case 'pending_approval':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved':
        return 'Approved'
      case 'rejected':
        return 'Rejected'
      case 'pending_approval':
        return 'Pending Approval'
      default:
        return 'Draft'
    }
  }

  const handleApproval = async (approvalAction: 'approve' | 'reject') => {
    if (!canApproveCampaigns(userRole)) return

    setAction(approvalAction)
    setLoading(true)

    try {
      const response = await fetch('/api/campaigns/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaign_id: campaign.id,
          action: approvalAction,
          feedback: feedback.trim() || null
        })
      })

      if (response.ok) {
        const data = await response.json()
        onApprovalUpdate(data.campaign)
        setFeedback('')
        setAction(null)
      }
    } catch (error) {
      console.error('Error updating campaign approval:', error)
    } finally {
      setLoading(false)
    }
  }

  const canApprove = canApproveCampaigns(userRole) && campaign.approval_status === 'pending_approval'

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Approval Status</h3>
        <div className="flex items-center space-x-2">
          {getStatusIcon(campaign.approval_status || 'draft')}
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(campaign.approval_status || 'draft')}`}>
            {getStatusText(campaign.approval_status || 'draft')}
          </span>
        </div>
      </div>

      {campaign.approval_status === 'approved' && campaign.approved_by && (
        <div className="mb-4 p-3 bg-green-50 rounded-md">
          <p className="text-sm text-green-800">
            <span className="font-medium">Approved</span> on {new Date(campaign.approved_at!).toLocaleDateString()}
          </p>
        </div>
      )}

      {campaign.approval_status === 'rejected' && campaign.approved_by && (
        <div className="mb-4 p-3 bg-red-50 rounded-md">
          <p className="text-sm text-red-800">
            <span className="font-medium">Rejected</span> on {new Date(campaign.approved_at!).toLocaleDateString()}
          </p>
        </div>
      )}

      {canApprove && (
        <div className="space-y-4">
          <div>
            <label htmlFor="feedback" className="block text-sm font-medium text-gray-700 mb-1">
              Feedback (Optional)
            </label>
            <textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Add feedback or suggestions..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              rows={3}
            />
          </div>

          <div className="flex space-x-3">
            <button
              onClick={() => handleApproval('approve')}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              {loading && action === 'approve' ? (
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
              onClick={() => handleApproval('reject')}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
            >
              {loading && action === 'reject' ? (
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
      )}

      {!canApprove && campaign.approval_status === 'pending_approval' && (
        <div className="p-3 bg-yellow-50 rounded-md">
          <p className="text-sm text-yellow-800">
            This campaign is waiting for admin approval before it can be sent.
          </p>
        </div>
      )}

      {campaign.approval_status === 'draft' && (
        <div className="p-3 bg-blue-50 rounded-md">
          <p className="text-sm text-blue-800">
            This campaign is in draft mode. Submit it for approval when ready.
          </p>
        </div>
      )}
    </div>
  )
} 