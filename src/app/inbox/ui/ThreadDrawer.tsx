'use client'

import { useState } from 'react'
import { useThreadMessages } from '@/hooks/useThreadMessages'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import Rewriter from './Rewriter'

type Props = {
  open: boolean
  onClose: () => void
  threadId: string | null
  threadMeta?: { subject?: string; from_email?: string; to_email?: string }
}

export default function ThreadDrawer({ open, onClose, threadId, threadMeta }: Props) {
  const { messages, isLoading, mutate } = useThreadMessages(threadId ?? undefined)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  if (!open) return null

  const onSend = async () => {
    if (!threadId || !threadMeta?.to_email) return
    setSending(true)
    // optimistic
    const optimistic = {
      id: 'temp-' + Math.random(),
      thread_id: threadId,
      direction: 'outgoing',
      subject: `Re: ${threadMeta?.subject ?? ''}`,
      body_text: body,
      from_email: threadMeta?.to_email,       // you → lead
      to_email: threadMeta?.from_email,       // lead
      sent_at: new Date().toISOString()
    }
    mutate({ messages: [...messages, optimistic] }, false)

    const res = await fetch('/api/inbox/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId,
        to: threadMeta?.from_email,
        from: threadMeta?.to_email,
        subject: optimistic.subject,
        bodyText: body
      })
    })
    if (!res.ok) {
      // rollback (simple)
      mutate()
    } else {
      setBody('')
      mutate()
    }
    setSending(false)
  }

  // Extract first name and company from email for default vars
  const defaultVars = {
    first_name: threadMeta?.from_email?.split('@')[0] || '',
    company: threadMeta?.from_email?.split('@')[1]?.split('.')[0] || '',
    position: '',
    last_email_summary: messages.length > 0 
      ? messages[messages.length - 1]?.body_text?.substring(0, 200) || ''
      : ''
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full max-w-4xl bg-background shadow-xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: timeline + composer */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold truncate">{threadMeta?.subject ?? 'Thread'}</h2>
              <p className="text-sm text-muted-foreground">
                {threadMeta?.from_email} ↔ {threadMeta?.to_email}
              </p>
            </div>
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
            {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {messages.map((m: any) => (
              <div
                key={m.id}
                className={`rounded-2xl border p-3 ${m.direction === 'outgoing' ? 'ml-12' : 'mr-12'}`}
              >
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-2">
                  <span>
                    {m.direction === 'outgoing' ? (m.from_email ?? 'You') : (m.from_email ?? 'Lead')} • {new Date(m.sent_at).toLocaleString()}
                  </span>
                  {m.ai_label && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                      {m.ai_label}
                    </span>
                  )}
                  {m.ai_intent && (
                    <span className="text-xs opacity-70">
                      {m.ai_intent}
                      {m.ai_confidence && ` · ${(m.ai_confidence * 100).toFixed(0)}%`}
                    </span>
                  )}
                </div>
                <div className="whitespace-pre-wrap text-sm">{m.body_text ?? m.body ?? ''}</div>
              </div>
            ))}
          </div>

          <div className="border-t pt-3">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your reply…"
              className="mb-2"
            />
            <div className="flex justify-end">
              <Button onClick={onSend} disabled={sending || !body.trim()}>
                {sending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </div>
        </div>

        {/* Right: Rewriter */}
        <div className="flex flex-col">
          <h3 className="text-lg font-semibold mb-2">Smart Template Rewriter</h3>
          <div className="flex-1 overflow-y-auto">
            <Rewriter
              composerValue={body}
              setComposerValue={setBody}
              defaultVars={defaultVars}
              templateBody={''}
              threadId={threadId}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

