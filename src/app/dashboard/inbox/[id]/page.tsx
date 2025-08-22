"use client"
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

export default function InboxThreadPage() {
  const params = useParams() as any
  const threadId = params?.id as string
  const [thread, setThread] = useState<any | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [reply, setReply] = useState('')

  useEffect(() => {
    if (!threadId) return
    fetch(`/api/inbox/thread?id=${threadId}`)
      .then(r => r.json())
      .then(j => { setThread(j.thread); setMessages(j.messages || []) })
  }, [threadId])

  async function sendReply() {
    if (!reply.trim() || !thread) return
    await fetch('/api/inbox/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ threadId, to: thread?.to || '', subject: `Re: ${thread?.subject || ''}`, bodyText: reply }) })
    setReply('')
    // reload
    const j = await fetch(`/api/inbox/thread?id=${threadId}`).then(r => r.json())
    setThread(j.thread); setMessages(j.messages || [])
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
      <div className="border-t p-4 flex gap-2">
        <textarea value={reply} onChange={(e) => setReply(e.target.value)} className="border rounded w-full p-2" rows={3} placeholder="Write a reply…" />
        <button onClick={sendReply} className="bg-blue-600 text-white px-4 py-2 rounded">Send</button>
      </div>
    </div>
  )
}

