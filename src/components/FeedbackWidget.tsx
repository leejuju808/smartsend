"use client"
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const FEEDBACK_CATEGORIES = [
  { value: 'ui', label: 'UI / Design' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'performance', label: 'Performance' },
  { value: 'other', label: 'Other' },
] as const

export default function FeedbackWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<string>('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])

  const submit = async () => {
    if (!category || !message.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category,
          message: message.trim(),
          page_pathname: pathname,
        }),
      })
      if (res.ok) {
        setSubmitted(true)
        setCategory('')
        setMessage('')
        setTimeout(() => {
          setOpen(false)
          setSubmitted(false)
        }, 1500)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="px-3 py-2 rounded-full bg-black text-white text-sm shadow-md hover:opacity-90 transition-opacity"
          aria-label="Send Feedback"
        >
          Send Feedback
        </button>
      )}

      {open && (
        <div className="w-80 rounded-lg border bg-white shadow-lg p-4">
          <div className="text-sm font-medium mb-3">Send Feedback</div>
          
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border rounded p-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="">Select category...</option>
            {FEEDBACK_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>

          <textarea
            placeholder="What's broken, confusing, or what feature would you like?"
            className="w-full border rounded p-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-black resize-none"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setOpen(false)
                setCategory('')
                setMessage('')
              }}
              className="text-xs text-gray-600 hover:underline"
            >
              Close
            </button>
            <button
              onClick={submit}
              disabled={submitting || !category || !message.trim()}
              className="px-3 py-1.5 bg-black text-white rounded-md text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitted ? 'Thanks!' : submitting ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

