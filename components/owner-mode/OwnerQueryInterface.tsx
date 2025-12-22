'use client'

import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'

interface OwnerQueryInterfaceProps {
  workspaceId: string
}

export function OwnerQueryInterface({ workspaceId }: OwnerQueryInterfaceProps) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<Array<{ question: string; answer: string }>>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim() || loading) return

    setLoading(true)
    try {
      const response = await fetch('/api/owner/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          workspace_id: workspaceId,
        }),
      })

      const data = await response.json()
      if (data.error) {
        setAnswer(`Error: ${data.error}`)
      } else {
        setAnswer(data.answer)
        setHistory([...history, { question, answer: data.answer }])
        setQuestion('')
      }
    } catch (error) {
      setAnswer('Failed to get answer. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white mb-2">Ask SmartSend Anything</h3>
        <p className="text-sm text-zinc-400">
          Get instant answers about your company using natural language
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g., What's our expected revenue in March?"
            className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Thinking...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Ask</span>
              </>
            )}
          </button>
        </div>
      </form>

      {answer && (
        <div className="mt-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
          <div className="text-sm text-zinc-400 mb-2">Answer:</div>
          <div className="text-white whitespace-pre-wrap">{answer}</div>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-6">
          <div className="text-sm font-semibold text-zinc-300 mb-3">Recent Questions</div>
          <div className="space-y-3">
            {history.slice(-3).reverse().map((item, idx) => (
              <div key={idx} className="p-3 bg-zinc-800/30 rounded-lg">
                <div className="text-sm text-zinc-400 mb-1">Q: {item.question}</div>
                <div className="text-sm text-zinc-300">{item.answer.substring(0, 100)}...</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

























