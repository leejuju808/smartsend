"use client"
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { wantsMeeting } from '@/lib/meeting-intent'
import { createMeetingInvite } from '@/lib/ics'
import ObjectionAssistant from '@/components/ObjectionAssistant'
import SmartMeetingInsert from '@/components/reply/SmartMeetingInsert'
import AIDraftAssistant from '@/components/inbox/AIDraftAssistant'
import IntentBadge from '@/components/IntentBadge'
import { useRewriter } from '@/hooks/useRewriter'
import { AutoActionsBanner } from '@/components/inbox/AutoActionsBanner'

export default function InboxThreadPage() {
  const params = useParams() as any
  const threadId = params?.id as string
  const [thread, setThread] = useState<any | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [reply, setReply] = useState('')
  const [autoInsertMeeting, setAutoInsertMeeting] = useState(true)
  const [showMeetingSuggestion, setShowMeetingSuggestion] = useState(false)
  const { rewrite, loading: rewriting } = useRewriter()

  const refreshThread = () => {
    if (!threadId) return
    fetch(`/api/inbox/thread?id=${threadId}`)
      .then(r => r.json())
      .then(j => { setThread(j.thread); setMessages(j.messages || []) })
  }

  useEffect(() => {
    refreshThread()
  }, [threadId])

  // Check for meeting intent when reply changes
  useEffect(() => {
    if (autoInsertMeeting && reply.trim()) {
      const hasMeetingIntent = wantsMeeting(reply)
      setShowMeetingSuggestion(hasMeetingIntent)
    } else {
      setShowMeetingSuggestion(false)
    }
  }, [reply, autoInsertMeeting])

  const handleSlashCommand = async (text: string) => {
    const match = text.match(/^\/rewrite:\s*(\w+)/)
    const mode = match?.[1]
    if (!mode) return false

    // Extract text after the command (can be on same line or next lines)
    const lines = text.split('\n')
    const firstLine = lines[0] || ''
    const commandMatch = firstLine.match(/^\/rewrite:\s*(\w+)\s*(.*)/)
    
    if (!commandMatch) return false
    
    // Get text after the command on first line, plus any following lines
    const textAfterCommand = commandMatch[2] || ''
    const remainingLines = lines.slice(1)
    const textToRewrite = (textAfterCommand + '\n' + remainingLines.join('\n')).trim()
    
    if (!textToRewrite) return false

    try {
      const newText = await rewrite(textToRewrite, mode)
      setReply(newText)
      return true
    } catch (error: any) {
      console.error("Error rewriting:", error)
      alert(error.message || "Failed to rewrite")
      return false
    }
  }

  async function sendReply() {
    if (!reply.trim() || !thread) return
    
    // Check for slash command before sending
    if (reply.trim().startsWith("/rewrite:")) {
      const handled = await handleSlashCommand(reply)
      if (handled) return // Don't send if it was a rewrite command
    }
    
    let finalReply = reply
    let attachments: any[] = []
    
    // Auto-insert meeting details if enabled and meeting intent detected
    if (autoInsertMeeting && wantsMeeting(reply)) {
      const start = new Date(Date.now() + 48 * 3600 * 1000) // 2 days out, 30-min slot
      const end = new Date(start.getTime() + 30 * 60 * 1000)
      
      // Generate ICS calendar file
      const ics = createMeetingInvite(
        "Intro Call – SmartSendAI",
        start,
        30,
        { name: "SmartSendAI Team", email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "hello@yourdomain.com" },
        { name: "Prospect", email: thread?.to || "" },
        "Looking forward to chatting!"
      )
      
      // Add Calendly link to reply
      const calendly = process.env.NEXT_PUBLIC_CALENDLY_URL
        ? `\n\nBook a time here: ${process.env.NEXT_PUBLIC_CALENDLY_URL}`
        : ""
      
      finalReply += `${calendly}\n\nI've attached a calendar invite for a 30-min intro.`
      
      // Note: In a real implementation, you would attach the ICS file here
      // For now, we'll just log that we would attach it
      console.log('Would attach ICS file:', ics)
    }
    
    try {
      // Get contact email from thread
      const toEmail = thread?.contacts?.email || thread?.to || '';
      const originalSubject = thread?.subject || '';
      
      const r = await fetch('/api/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          to: toEmail,
          subject: `Re: ${originalSubject}`,
          bodyText: finalReply,
          bodyHtml: finalReply.replace(/\n/g, '<br>'),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to send');
      
      setReply('');
      // reload thread to show the new message
      const j2 = await fetch(`/api/inbox/thread?id=${threadId}`).then(r => r.json());
      setThread(j2.thread); setMessages(j2.messages || []);
    } catch (error) {
      console.error('Failed to send reply:', error);
      alert('Failed to send reply. Please try again.');
    }
  }

  if (!thread) return <div>Loading…</div>

  return (
    <div className="bg-white rounded-lg border">
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <div className="font-medium">{thread.subject || '(no subject)'}</div>
          {thread.last_intent && <IntentBadge intent={thread.last_intent} />}
        </div>
        <div className="text-sm text-gray-600 mt-1">Status: {thread.status}</div>
        <AutoActionsBanner
          threadId={threadId}
          lastAiLabel={thread.last_ai_label}
          status={thread.status}
          stoppedByReply={thread.stopped_by_reply}
          onActionComplete={refreshThread}
        />
        {!thread.stopped_by_reply && (
          <div className="mt-2">
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/inbox/thread/manual-stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ threadId, action: 'stop' }),
                  });
                  if (!res.ok) throw new Error('Failed to stop sequence');
                  refreshThread();
                } catch (e) {
                  alert('Failed to stop future steps. Please try again.');
                  console.error(e);
                }
              }}
              className="text-xs border rounded-md px-3 py-1.5 hover:bg-gray-50"
            >
              Stop future steps
            </button>
          </div>
        )}
      </div>
      <div className="p-4 space-y-4">
        {messages.map((m) => (
          <div key={m.id} className="border rounded p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-gray-500">{m.is_incoming ? 'Incoming' : 'Outgoing'} • {new Date(m.sent_at).toLocaleString()}</div>
              {m.intent && (m.direction === 'received' || m.direction === 'inbound' || m.is_incoming) && (
                <IntentBadge intent={m.intent} confidence={m.intent_confidence} size="sm" />
              )}
            </div>
            {m.is_incoming ? (
              <div className="mt-1 whitespace-pre-wrap">{m.body}</div>
            ) : (
              // Outbound is trusted (our own), safe to render as HTML
              <div className="mt-1 prose max-w-none" dangerouslySetInnerHTML={{ __html: m.body }} />
            )}
            
            {/* Show extracted meeting times if available */}
            {m.extracted_times && Array.isArray(m.extracted_times) && m.extracted_times.length > 0 && (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                <div className="text-xs font-medium text-blue-900 mb-1">📅 Proposed Meeting Times:</div>
                {m.extracted_times.map((time: any, idx: number) => (
                  <div key={idx} className="text-xs text-blue-800">
                    {time.text || time.start_iso || JSON.stringify(time)}
                  </div>
                ))}
                <button
                  onClick={() => {
                    // TODO: Implement "Propose Time" button action
                    alert('Propose Time is not available in v1.')
                  }}
                  className="mt-2 text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                >
                  Propose Time
                </button>
              </div>
            )}
            
            {/* AI Draft Assistant for incoming messages */}
            {m.is_incoming && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <AIDraftAssistant
                  messageId={m.id}
                  threadId={threadId}
                  messageBody={m.body}
                  onInsertDraft={(draft) => setReply(prev => prev ? prev + "\n\n" + draft : draft)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="border-t p-4 space-y-3">
        {/* Meeting Intent Toggle */}
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="autoInsertMeeting"
            checked={autoInsertMeeting}
            onChange={(e) => setAutoInsertMeeting(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="autoInsertMeeting" className="text-sm text-gray-700">
            Auto-insert meeting details when meeting intent detected
          </label>
        </div>
        
        {/* Meeting Suggestion */}
        {showMeetingSuggestion && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-sm text-blue-800 font-medium mb-2">
              🗓️ Meeting Intent Detected
            </div>
            <div className="text-sm text-blue-700">
              We'll automatically add your Calendly link and attach a calendar invite when you send this reply.
            </div>
          </div>
        )}
        
        {/* Objection Assistant */}
        {messages.length > 0 && (
          <ObjectionAssistant
            lastMessage={messages[messages.length - 1]?.body || ""}
            vars={{
              first_name: thread?.contact?.first_name || thread?.from?.split('@')[0] || "",
              company: thread?.contact?.company || "",
              my_name: "SmartSendAI Team",
              calendly: process.env.NEXT_PUBLIC_CALENDLY_URL || "",
            }}
            onInsert={(text) => setReply(prev => prev ? prev + "\n\n" + text : text)}
          />
        )}
        
        {/* Reply Form */}
        <div className="space-y-3">
          <textarea 
            value={reply} 
            onChange={(e) => setReply(e.target.value)} 
            className="border rounded w-full p-2" 
            rows={3} 
            placeholder="Write a reply… (use /rewrite: warmer, /rewrite: shorter, /rewrite: formal, or /rewrite: summarize)"
            onKeyDown={async (e) => {
              if (e.key === "Enter" && e.shiftKey && reply.trim().startsWith("/rewrite:")) {
                e.preventDefault()
                await handleSlashCommand(reply)
              }
            }}
            disabled={rewriting}
          />
          {rewriting && (
            <div className="text-sm text-blue-500">Rewriting...</div>
          )}
          
          {/* Smart Meeting Insert */}
          <SmartMeetingInsert
            composerText={reply}
            organizerEmail={process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@yourdomain.com"}
            onInsert={({ text, icsUrl }) => {
              setReply(prev => (prev ? prev + "\n\n" : "") + text);
              if (icsUrl) {
                // Note: In a real implementation, you would attach the ICS file here
                console.log('ICS file ready for attachment:', icsUrl);
              }
            }}
          />
          
          <div className="flex gap-2">
            <button onClick={sendReply} className="bg-blue-600 text-white px-4 py-2 rounded">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

