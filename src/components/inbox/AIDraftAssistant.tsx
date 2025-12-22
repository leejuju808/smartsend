"use client"
import { useState } from 'react'

interface AIDraftAssistantProps {
  messageId: string
  threadId: string
  messageBody: string
  onInsertDraft: (draft: string) => void
  className?: string
}

export default function AIDraftAssistant({ 
  messageId, 
  threadId, 
  messageBody, 
  onInsertDraft, 
  className = "" 
}: AIDraftAssistantProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDraft, setShowDraft] = useState(false)

  const generateDraft = async () => {
    setIsGenerating(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/inbox/threads/${threadId}/ai-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate draft')
      }
      
      setDraft(data.draft)
      setShowDraft(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate draft')
    } finally {
      setIsGenerating(false)
    }
  }

  const insertDraft = () => {
    if (draft) {
      onInsertDraft(draft)
      setShowDraft(false)
    }
  }

  const regenerateDraft = () => {
    setShowDraft(false)
    setDraft(null)
    generateDraft()
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Generate Button */}
      <div className="flex items-center space-x-2">
        <button
          onClick={generateDraft}
          disabled={isGenerating}
          className="inline-flex items-center px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate AI Reply
            </>
          )}
        </button>
        
        {draft && (
          <button
            onClick={() => setShowDraft(!showDraft)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {showDraft ? 'Hide' : 'Show'} Draft
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </div>
      )}

      {/* AI Draft Display */}
      {showDraft && draft && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-blue-800">AI Reply Suggestion</span>
            </div>
            <div className="flex space-x-1">
              <button
                onClick={insertDraft}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Insert
              </button>
              <button
                onClick={regenerateDraft}
                className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                Regenerate
              </button>
            </div>
          </div>
          
          <div className="text-sm text-gray-700 leading-relaxed">
            {draft}
          </div>
          
          <div className="mt-2 text-xs text-gray-500">
            💡 Click "Insert" to add this to your reply, or "Regenerate" for a different suggestion
          </div>
        </div>
      )}
    </div>
  )
} 