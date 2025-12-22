'use client'

import { ThreadDetailV2 } from '@/app/(dash)/inbox-v2/page'
import { formatDistanceToNow } from 'date-fns'
import { InboxV2ReplyComposer } from './InboxV2ReplyComposer'
import { InboxV2StickyHeader } from './mobile/InboxV2StickyHeader'
import { InboxV2TapToCall, makePhoneNumbersClickable } from './mobile/InboxV2TapToCall'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import { HandsFreeMode } from './voice/HandsFreeMode'
import { CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PhotoAnalysisCard } from '@/components/inbox/PhotoAnalysisCard'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

type Props = {
  detail: ThreadDetailV2
  loading: boolean
  onRefresh: () => void
}

export function InboxV2Conversation({ detail, loading, onRefresh }: Props) {
  const isMobile = useIsMobile()
  const [photoAnalyses, setPhotoAnalyses] = useState<Record<string, any>>({})
  const [handsFreeMode, setHandsFreeMode] = useState(false)
  const contactName = detail.contact 
    ? `${detail.contact.first_name || ''} ${detail.contact.last_name || ''}`.trim() || 'Unknown'
    : null

  // Fetch photo analyses for image attachments
  useEffect(() => {
    const fetchPhotoAnalyses = async () => {
      const imageAttachments = detail.messages
        .flatMap(m => m.attachments || [])
        .filter(att => att.file_type?.startsWith('image/'))
        .map(att => att.id)

      if (imageAttachments.length === 0) return

      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        const { data: analyses } = await supabase
          .from('image_analysis_reports')
          .select('*')
          .in('attachment_id', imageAttachments)

        if (analyses) {
          const analysesMap: Record<string, any> = {}
          analyses.forEach(analysis => {
            if (analysis.attachment_id) {
              analysesMap[analysis.attachment_id] = analysis
            }
          })
          setPhotoAnalyses(analysesMap)
        }
      } catch (error) {
        console.error('Error fetching photo analyses:', error)
      }
    }

    if (detail.messages.length > 0) {
      fetchPhotoAnalyses()
    }
  }, [detail.messages])
  const getDeliverabilityIcon = (status?: string) => {
    switch (status) {
      case 'delivered':
        return <CheckCircle2 className="w-3 h-3 text-green-600" />
      case 'opened':
        return <CheckCircle2 className="w-3 h-3 text-blue-600" />
      case 'link_clicked':
        return <CheckCircle2 className="w-3 h-3 text-purple-600" />
      case 'bounced':
        return <XCircle className="w-3 h-3 text-red-600" />
      case 'marked_spam':
        return <AlertCircle className="w-3 h-3 text-red-600" />
      case 'sent':
      case 'queued':
        return <Clock className="w-3 h-3 text-gray-400" />
      default:
        return null
    }
  }

  const getDeliverabilityLabel = (status?: string) => {
    switch (status) {
      case 'delivered': return 'Delivered'
      case 'opened': return 'Opened'
      case 'link_clicked': return 'Link Clicked'
      case 'bounced': return 'Bounced'
      case 'marked_spam': return 'Marked Spam'
      case 'sent': return 'Sent'
      case 'queued': return 'Queued'
      default: return null
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading conversation...</div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sticky Header - Mobile Only */}
      {isMobile ? (
        <InboxV2StickyHeader
          contactName={contactName}
          phone={detail.contact?.phone}
        />
      ) : (
        <div className="border-b p-4 bg-white">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-lg font-semibold mb-1">
                {detail.thread.subject || '(no subject)'}
              </h2>
              {detail.contact && (
                <div className="text-sm text-gray-600">
                  <span>{detail.contact.first_name} {detail.contact.last_name}</span>
                  {detail.contact.email && (
                    <span className="ml-2 text-gray-400">{detail.contact.email}</span>
                  )}
                  {detail.contact.phone && (
                    <InboxV2TapToCall phone={detail.contact.phone}>
                      <span className="ml-2 text-blue-600 underline">{detail.contact.phone}</span>
                    </InboxV2TapToCall>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {detail.messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.direction === 'in' ? 'justify-start' : 'justify-end'
            }`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                message.direction === 'in'
                  ? 'bg-white border border-gray-200'
                  : 'bg-blue-50 border border-blue-200'
              }`}
            >
              {/* Message Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">
                    {message.direction === 'in' 
                      ? detail.contact?.first_name || 'Homeowner'
                      : 'You'
                    }
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(message.sent_at), { addSuffix: true })}
                  </span>
                </div>
                {message.direction === 'out' && message.deliverability_status && (
                  <div className="flex items-center gap-1">
                    {getDeliverabilityIcon(message.deliverability_status.status)}
                    <span className="text-xs text-gray-500">
                      {getDeliverabilityLabel(message.deliverability_status.status)}
                    </span>
                  </div>
                )}
              </div>

              {/* Message Body */}
              {message.body_html ? (
                <div
                  className="prose prose-sm max-w-none text-sm inbox-message-bubble"
                  dangerouslySetInnerHTML={{ __html: message.body_html }}
                />
              ) : (
                <div className="text-sm whitespace-pre-wrap inbox-message-bubble">
                  {isMobile ? makePhoneNumbersClickable(message.body_text || '(no content)') : (message.body_text || '(no content)')}
                </div>
              )}

              {/* Attachments */}
              {message.attachments && message.attachments.length > 0 && (
                <div className="mt-2 space-y-3">
                  {message.attachments.map((attachment) => {
                    const isImage = attachment.file_type?.startsWith('image/')
                    const analysis = isImage ? photoAnalyses[attachment.id] : null
                    
                    return (
                      <div key={attachment.id} className="space-y-2">
                        <a
                          href={attachment.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs text-blue-600 hover:underline"
                        >
                          <span>{attachment.file_name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {attachment.file_type}
                          </Badge>
                        </a>
                        
                        {/* Photo Analysis Card (Block 19940) */}
                        {isImage && analysis && (
                          <PhotoAnalysisCard
                            report={analysis}
                            imageUrl={attachment.file_url}
                            className="mt-2"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Reply Composer */}
      <div className="border-t bg-white">
        <InboxV2ReplyComposer
          threadId={detail.thread.id}
          contact={detail.contact}
          onSent={onRefresh}
        />
      </div>

      {/* Hands-Free Mode */}
      {isMobile && (
        <>
          <HandsFreeMode
            isActive={handsFreeMode}
            onClose={() => setHandsFreeMode(false)}
            onSend={async (message) => {
              // Send message via API
              try {
                const res = await fetch('/api/inbox-v2/send-reply', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    thread_id: detail.thread.id,
                    to: detail.contact?.email,
                    body_text: message,
                    body_html: message.replace(/\n/g, '<br/>'),
                  }),
                })
                if (res.ok) {
                  onRefresh()
                  setHandsFreeMode(false)
                }
              } catch (error) {
                console.error('Failed to send:', error)
              }
            }}
            threadId={detail.thread.id}
            contactName={contactName || undefined}
          />
          {/* Hands-Free Mode Toggle Button */}
          <div className="fixed bottom-20 right-4 z-40">
            <Button
              onClick={() => setHandsFreeMode(true)}
              size="lg"
              className="rounded-full w-16 h-16 shadow-lg"
            >
              🎤
            </Button>
          </div>
        </>
      )}
    </div>
  )
}



