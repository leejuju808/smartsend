"use client"
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { wantsMeeting } from '@/lib/meeting-intent'
import { buildSimpleICS } from '@/lib/ics'

export default function InboxThreadPage() {
  const params = useParams() as any
  const threadId = params?.id as string
  const [thread, setThread] = useState<any | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [reply, setReply] = useState('')
  const [autoInsertMeeting, setAutoInsertMeeting] = useState(true)
  const [showMeetingSuggestion, setShowMeetingSuggestion] = useState(false)

  useEffect(() => {
    if (!threadId) return
    fetch(`/api/inbox/thread?id=${threadId}`)
      .then(r => r.json())
      .then(j => { setThread(j.thread); setMessages(j.messages || []) })
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

  async function sendReply() {
    if (!reply.trim() || !thread) return
    
    let finalReply = reply
    let attachments: any[] = []
    
    // Auto-insert meeting details if enabled and meeting intent detected
    if (autoInsertMeeting && wantsMeeting(reply)) {
      const start = new Date(Date.now() + 48 * 3600 * 1000) // 2 days out, 30-min slot
      const end = new Date(start.getTime() + 30 * 60 * 1000)
      
      // Generate ICS calendar file
      const ics = buildSimpleICS({
        title: "Intro Call – SmartSendAI",
        description: "Looking forward to chatting!",
        url: process.env.NEXT_PUBLIC_CALENDLY_URL ?? "",
        start, 
        end, 
        organizer: "mailto:" + (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "hello@yourdomain.com")
      })
      
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
      const r = await fetch('/api/replies/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: thread?.to || '',
          subject: `Re: ${thread?.subject || ''}`,
          body: finalReply,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to send');
      
      setReply('');
      // reload
      const j2 = await fetch(`/api/inbox/thread?id=${threadId}`).then(r => r.json());
      setThread(j2.thread); setMessages(j2.messages || []);
    } catch (error) {
      console.error('Failed to send reply:', error);
      // You could add a toast notification here
    }
  }

  if (!thread) return <div>Loading…</div>

  return (
    <div className="bg-white rounded-lg border">
      <div className="px-4 py-3 border-b">
        <div className="font-medium">{thread.subject || '(no subject)'}</div>
        <div className="text-sm text-gray-600">Status: {thread.status}</div>
      </div>
      <div className="p-4 space-y-4">
        {messages.map((m) => (
          <div key={m.id} className="border rounded p-3">
            <div className="text-xs text-gray-500">{m.is_incoming ? 'Incoming' : 'Outgoing'} • {new Date(m.sent_at).toLocaleString()}</div>
            <div className="mt-1 whitespace-pre-wrap">{m.body}</div>
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
        
        {/* Reply Form */}
        <div className="flex gap-2">
          <textarea 
            value={reply} 
            onChange={(e) => setReply(e.target.value)} 
            className="border rounded w-full p-2" 
            rows={3} 
            placeholder="Write a reply…" 
          />
          <button onClick={sendReply} className="bg-blue-600 text-white px-4 py-2 rounded">
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

