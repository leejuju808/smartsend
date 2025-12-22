'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { LeadStatusBadge } from './LeadStatusBadge'

type Lead = {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  reply_state?: 'none' | 'suspected' | 'confirmed' | null
  replied_at?: string | null
}

type Message = {
  id: string
  sender: string
  subject: string
  body: string
  body_text?: string
  body_html?: string
  is_incoming: boolean
  created_at: string
}

export function InboxDrawer({ 
  open, 
  onClose, 
  lead 
}: { 
  open: boolean
  onClose: () => void
  lead: Lead | null 
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !lead?.id) return

    async function loadMessages() {
      setLoading(true)
      try {
        // Try to find emails for this lead
        const { data, error } = await supabase
          .from('emails')
          .select('*')
          .or(`lead_id.eq.${lead.id},sender.ilike.%${lead.email}%`)
          .order('created_at', { ascending: true })
          .limit(20)

        if (!error && data) {
          setMessages(data as Message[])
        }
      } catch (err) {
        console.error('Failed to load messages:', err)
      } finally {
        setLoading(false)
      }
    }

    loadMessages()
  }, [open, lead])

  if (!open || !lead) return null

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white border-l border-gray-200 shadow-xl z-50">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
              <span className="text-sm font-medium text-gray-700">
                {lead.first_name?.[0]?.toUpperCase() || lead.email[0]?.toUpperCase()}
              </span>
            </div>
            <div>
              <div className="font-semibold text-gray-900">
                {lead.first_name || lead.last_name
                  ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim()
                  : 'Unknown'}
              </div>
              <div className="text-sm text-gray-600">{lead.email}</div>
            </div>
            <LeadStatusBadge state={lead.reply_state || 'none'} />
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Company info */}
        {lead.company && (
          <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-600">
              <span className="font-medium">Company:</span> {lead.company}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="text-center text-gray-500 py-8">Loading messages…</div>
          ) : messages.length > 0 ? (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-2xl p-4 ${
                  msg.is_incoming 
                    ? 'bg-blue-50 border border-blue-100' 
                    : 'bg-gray-50 border border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-gray-900">{msg.sender}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(msg.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="text-xs font-medium text-gray-700 mb-2">{msg.subject}</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {msg.body || msg.body_text || msg.body_html || '(no content)'}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-500 py-8">
              No messages found for this lead
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="text-xs text-gray-500">
            Last replied: {lead.replied_at 
              ? new Date(lead.replied_at).toLocaleString() 
              : 'Never'}
          </div>
        </div>
      </div>
    </div>
  )
}

