'use client'

import { useState, type MouseEvent } from 'react'
import { toast } from 'sonner'

import { LeadStatusBadge } from './LeadStatusBadge'

type Lead = {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  campaign_id: string
  reply_state?: 'none' | 'suspected' | 'confirmed' | null
  replied_at?: string | null
  last_incoming_at?: string | null
  auto_detected?: boolean
  paused_reason?: string | null
  paused_until?: string | null
  paused?: boolean
}

type InboxTableProps = {
  data: Lead[]
  onRowClick?: (lead: Lead) => void
  onResume?: () => void | Promise<void>
}

export function InboxTable({ data, onRowClick, onResume }: InboxTableProps) {
  const [resumeId, setResumeId] = useState<string | null>(null)

  const handleResume = async (event: MouseEvent<HTMLButtonElement>, lead: Lead) => {
    event.stopPropagation()
    if (resumeId) return

    setResumeId(lead.id)
    try {
      const res = await fetch('/api/resume-followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: lead.campaign_id,
          lead_id: lead.id,
          reason: 'manual_unpause',
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || payload?.ok === false || payload?.error) {
        throw new Error(payload?.error || `Failed (${res.status})`)
      }

      toast.success('Follow-ups resumed')
      await Promise.resolve(onResume?.())
    } catch (error: any) {
      toast.error(error?.message || 'Unable to resume follow-ups')
    } finally {
      setResumeId(null)
    }
  }

  return (
    <div className="rounded-2xl border overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Email
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Company
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Last Reply
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((lead) => (
            <tr
              key={lead.id}
              onClick={() => onRowClick?.(lead)}
              className="hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex items-center">
                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center mr-3">
                    <span className="text-xs font-medium text-gray-700">
                      {lead.first_name?.[0]?.toUpperCase() || lead.email[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-gray-900">
                    {lead.first_name || lead.last_name
                      ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim()
                      : 'Unknown'}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="text-sm text-gray-600">{lead.email}</div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="text-sm text-gray-600">{lead.company || '—'}</div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <LeadStatusBadge state={lead.reply_state || 'none'} autoDetected={lead.auto_detected} />
                  {lead.paused ? (
                    <>
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                        Paused: {lead.paused_reason === 'ooo_detected' ? 'OOO' : lead.paused_reason || 'Manual'}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => handleResume(event, lead)}
                        className="inline-flex items-center rounded-full bg-amber-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-amber-600 transition disabled:opacity-70"
                        disabled={resumeId === lead.id}
                      >
                        {resumeId === lead.id ? 'Resuming…' : 'Resume'}
                      </button>
                    </>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                {lead.replied_at
                  ? new Date(lead.replied_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : lead.last_incoming_at
                    ? new Date(lead.last_incoming_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && (
        <div className="p-10 text-center text-gray-500">No leads found</div>
      )}
    </div>
  )
}

