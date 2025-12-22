/**
 * Block 23870 — SmartSend Roofing Analytics Upgrade Prompts
 * Shows upgrade prompts based on analytics triggers
 */

'use client'

import { useState, useEffect } from 'react'
import { ArrowUpRight, X, Zap, Mail, Target } from 'lucide-react'

interface UpgradePrompt {
  type: string
  currentPlan: string
  suggestedPlan: string
  message: string
  triggerMetric: string
  triggerValue: number
  priority: 'low' | 'medium' | 'high'
}

export default function UpgradePrompts() {
  const [prompts, setPrompts] = useState<UpgradePrompt[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadPrompts()
  }, [])

  const loadPrompts = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/analytics/upgrade-prompts')
      const data = await response.json()

      if (data.success) {
        setPrompts(data.prompts || [])
      }
    } catch (error) {
      console.error('Error loading upgrade prompts:', error)
    } finally {
      setLoading(false)
    }
  }

  const dismissPrompt = async (promptType: string) => {
    try {
      await fetch('/api/analytics/upgrade-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptType, action: 'dismiss' })
      })
      setDismissed(prev => new Set([...prev, promptType]))
    } catch (error) {
      console.error('Error dismissing prompt:', error)
    }
  }

  const handleUpgrade = (suggestedPlan: string) => {
    // Redirect to billing/upgrade page
    window.location.href = `/billing?upgrade=${suggestedPlan}`
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-orange-500 bg-orange-50'
      case 'medium': return 'border-blue-500 bg-blue-50'
      default: return 'border-gray-300 bg-gray-50'
    }
  }

  const getIcon = (type: string) => {
    if (type.includes('email')) return <Mail className="w-5 h-5" />
    if (type.includes('campaign')) return <Target className="w-5 h-5" />
    if (type.includes('performance')) return <Zap className="w-5 h-5" />
    return <ArrowUpRight className="w-5 h-5" />
  }

  const activePrompts = prompts.filter(p => !dismissed.has(p.type))

  if (loading) {
    return null
  }

  if (activePrompts.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      {activePrompts.map((prompt) => (
        <div
          key={prompt.type}
          className={`border-l-4 rounded-lg p-4 ${getPriorityColor(prompt.priority)}`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              <div className="p-2 bg-white rounded-lg">
                {getIcon(prompt.type)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-gray-900">
                    Upgrade to {prompt.suggestedPlan.charAt(0).toUpperCase() + prompt.suggestedPlan.slice(1)}
                  </h4>
                  {prompt.priority === 'high' && (
                    <span className="px-2 py-0.5 bg-orange-200 text-orange-800 text-xs font-medium rounded">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-700 mb-3">{prompt.message}</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleUpgrade(prompt.suggestedPlan)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
                  >
                    Upgrade Now
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => dismissPrompt(prompt.type)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => dismissPrompt(prompt.type)}
              className="ml-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}






































