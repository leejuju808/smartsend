"use client"
import { useEffect, useState } from 'react'

type StarProps = { filled: boolean; onClick: () => void; onMouseEnter: () => void; onMouseLeave: () => void }

function Star({ filled, onClick, onMouseEnter, onMouseLeave }: StarProps) {
  return (
    <button
      type="button"
      aria-label="rating star"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`w-6 h-6 ${filled ? 'text-yellow-400' : 'text-gray-300'} transition-colors`}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.802 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.802-2.034a1 1 0 00-1.175 0L6.56 16.281c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.926 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    </button>
  )
}

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const [rating, setRating] = useState<number>(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])

  const submit = async () => {
    if (!rating) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rating, comment }) })
      if (res.ok) {
        setSubmitted(true)
        setTimeout(() => setOpen(false), 1200)
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
          className="px-3 py-2 rounded-full bg-black text-white text-sm shadow-md hover:opacity-90"
        >
          Feedback
        </button>
      )}

      {open && (
        <div className="w-80 rounded-lg border bg-white shadow-lg p-3">
          <div className="text-sm font-medium mb-2">How’s it going?</div>
          <div className="flex items-center gap-1 mb-2">
            {[1,2,3,4,5].map(n => (
              <Star
                key={n}
                filled={(hover ?? rating) >= n}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </div>
          <textarea
            placeholder="What’s broken or confusing?"
            className="w-full border rounded p-2 text-sm mb-2"
            rows={3}
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <button onClick={()=>setOpen(false)} className="text-xs text-gray-600 hover:underline">Close</button>
            <button
              onClick={submit}
              disabled={submitting || rating===0}
              className="px-3 py-1.5 bg-black text-white rounded-md text-xs disabled:opacity-50"
            >
              {submitted ? 'Thanks!' : (submitting ? 'Sending…' : 'Send')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

