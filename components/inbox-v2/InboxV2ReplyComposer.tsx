'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Paperclip, Send, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { InboxV2QuickReplies, DEFAULT_QUICK_REPLIES } from './mobile/InboxV2QuickReplies'
import { InboxV2PhotoCapture } from './mobile/InboxV2PhotoCapture'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import { VoiceReplyButton } from './voice/VoiceReplyButton'

type Props = {
  threadId: string
  contact: {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    phone?: string | null
  } | null
  onSent: () => void
  quickReplies?: Array<{ text: string; type: string }>
}

export function InboxV2ReplyComposer({ 
  threadId, 
  contact, 
  onSent,
  quickReplies = DEFAULT_QUICK_REPLIES,
}: Props) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [aiAssistOpen, setAiAssistOpen] = useState(false)
  const isMobile = useIsMobile()

  const handleSend = async () => {
    if (!body.trim()) {
      toast.error('Please enter a message')
      return
    }

    setSending(true)
    try {
      const res = await fetch('/api/inbox-v2/send-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          to: contact?.email,
          subject: subject || undefined,
          body_text: body,
          body_html: body.replace(/\n/g, '<br/>'),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send reply')
      }

      toast.success('Reply sent')
      setBody('')
      setSubject('')
      onSent()
    } catch (error: any) {
      console.error('Error sending reply:', error)
      toast.error(error.message || 'Failed to send reply')
    } finally {
      setSending(false)
    }
  }

  const handleAIAssist = async () => {
    if (!body.trim()) {
      toast.error('Please enter some text first')
      return
    }

    try {
      const res = await fetch('/api/inbox-v2/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          draft: body,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to get AI assistance')
      }

      const data = await res.json()
      if (data.suggested_reply) {
        setBody(data.suggested_reply)
        toast.success('AI suggestion applied')
      }
    } catch (error) {
      console.error('Error getting AI assist:', error)
      toast.error('Failed to get AI assistance')
    }
  }

  const handleQuickReplySelect = (reply: { text: string; type: string }) => {
    setBody(reply.text)
  }

  const handlePhotoCapture = async (file: File) => {
    // TODO: Upload photo and attach to message
    toast.info('Photo capture: ' + file.name)
  }

  const handlePhotoSelect = async (file: File) => {
    // TODO: Upload photo and attach to message
    toast.info('Photo selected: ' + file.name)
  }

  return (
    <div className="p-4 space-y-3">
      {/* Quick Replies - Mobile Only */}
      {isMobile && (
        <InboxV2QuickReplies
          replies={quickReplies}
          onSelect={handleQuickReplySelect}
        />
      )}

      {/* Subject - Hidden on mobile in speed mode */}
      <Input
        placeholder="Subject (optional)"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="text-sm hidden md:block"
      />

      {/* Body */}
      <div className="relative">
        <Textarea
          placeholder="Type your reply…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={isMobile ? 4 : 6}
          className="text-sm pr-20"
        />
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {/* Voice Reply Button */}
          <VoiceReplyButton
            onTranscriptReady={(transcript) => {
              setBody(transcript)
              toast.success('Voice message transcribed')
            }}
            threadId={threadId}
            disabled={sending}
          />
          {/* AI Assist Button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleAIAssist}
            title="AI Assist"
          >
            <Sparkles className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Photo Capture - Mobile */}
          {isMobile ? (
            <InboxV2PhotoCapture
              onPhotoCapture={handlePhotoCapture}
              onPhotoSelect={handlePhotoSelect}
            />
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                // Handle attachment
                toast.info('Attachment feature coming soon')
              }}
            >
              <Paperclip className="w-4 h-4 mr-1" />
              Attach
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setBody('')
              setSubject('')
            }}
          >
            Clear
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={sending || !body.trim()}
          >
            <Send className="w-4 h-4 mr-1" />
            {sending ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  )
}



