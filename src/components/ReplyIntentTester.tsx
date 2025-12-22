"use client"

import { useState } from 'react'
import { ReplyIntentDetector, type ReplyIntent } from '@/lib/reply-intent-detector'
import { MessageSquare, Calendar, Download, AlertCircle, CheckCircle } from 'lucide-react'

export default function ReplyIntentTester() {
  const [replyText, setReplyText] = useState('')
  const [intent, setIntent] = useState<ReplyIntent | null>(null)
  const [showICS, setShowICS] = useState(false)

  const testIntent = () => {
    if (!replyText.trim()) return
    
    const detectedIntent = ReplyIntentDetector.detectIntent(replyText)
    setIntent(detectedIntent)
    setShowICS(detectedIntent.responseType === 'immediate_ics')
  }

  const generateTestICS = () => {
    if (!intent) return
    
    const testInvite = ReplyIntentDetector.generateDefaultInvite(
      'Test Contact',
      'test@example.com',
      'SmartSend User',
      'user@smartsend.ai',
      intent.suggestedTime,
      intent.suggestedDate
    )
    
    const icsData = ReplyIntentDetector.generateICS(testInvite)
    const blob = new Blob([icsData], { type: 'text/calendar' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'test-meeting-invite.ics'
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 70) return 'text-green-600'
    if (confidence >= 40) return 'text-yellow-600'
    return 'text-gray-600'
  }

  const getResponseTypeIcon = (responseType: ReplyIntent['responseType']) => {
    switch (responseType) {
      case 'immediate_ics':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'human_review':
        return <AlertCircle className="h-5 w-5 text-yellow-600" />
      default:
        return <MessageSquare className="h-5 w-5 text-gray-600" />
    }
  }

  const getResponseTypeText = (responseType: ReplyIntent['responseType']) => {
    switch (responseType) {
      case 'immediate_ics':
        return 'High Confidence - ICS Generated'
      case 'human_review':
        return 'Medium Confidence - Review Recommended'
      default:
        return 'Low Confidence - No Action'
    }
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center mb-4">
        <MessageSquare className="h-6 w-6 text-blue-600 mr-2" />
        <h3 className="text-lg font-medium text-gray-900">Reply Intent Tester</h3>
      </div>
      
      <p className="text-sm text-gray-600 mb-4">
        Test how SmartSend detects meeting intent in email replies. Paste a reply below to see the analysis.
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="replyText" className="block text-sm font-medium text-gray-700 mb-2">
            Reply Text
          </label>
          <textarea
            id="replyText"
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Paste an email reply here to test intent detection..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
          />
        </div>

        <button
          onClick={testIntent}
          disabled={!replyText.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Test Intent Detection
        </button>

        {intent && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-900">Intent Analysis Results</h4>
              {getResponseTypeIcon(intent.responseType)}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-sm font-medium text-gray-700">Confidence Score</div>
                <div className={`text-2xl font-bold ${getConfidenceColor(intent.confidence)}`}>
                  {intent.confidence}%
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-700">Response Type</div>
                <div className="text-sm text-gray-900">{getResponseTypeText(intent.responseType)}</div>
              </div>
            </div>

            {intent.detectedKeywords.length > 0 && (
              <div className="mb-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Detected Keywords</div>
                <div className="flex flex-wrap gap-2">
                  {intent.detectedKeywords.map((keyword, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(intent.suggestedTime || intent.suggestedDate) && (
              <div className="mb-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Time Suggestions</div>
                <div className="flex gap-4 text-sm text-gray-900">
                  {intent.suggestedDate && (
                    <div>
                      <span className="font-medium">Date:</span> {intent.suggestedDate}
                    </div>
                  )}
                  {intent.suggestedTime && (
                    <div>
                      <span className="font-medium">Time:</span> {intent.suggestedTime}
                    </div>
                  )}
                </div>
              </div>
            )}

            {showICS && (
              <div className="border-t pt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 text-green-600 mr-2" />
                    <span className="text-sm font-medium text-gray-700">
                      ICS Calendar Invite Generated
                    </span>
                  </div>
                  <button
                    onClick={generateTestICS}
                    className="flex items-center px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download ICS
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">💡 Tips for Better Intent Detection</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Use clear meeting language: "book a call", "schedule a meeting", "let's talk"</li>
          <li>• Include time preferences: "tomorrow", "next week", "2 PM"</li>
          <li>• Express availability: "when are you free?", "what works for you?"</li>
          <li>• Avoid vague language that could be interpreted as general interest</li>
        </ul>
      </div>
    </div>
  )
} 