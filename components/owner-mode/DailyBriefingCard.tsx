'use client'

import { useEffect, useState } from 'react'
import { Calendar, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react'

interface DailyBriefingCardProps {
  workspaceId: string
}

interface BriefingData {
  briefing: string
  metrics: Record<string, any>
  date: string
}

export function DailyBriefingCard({ workspaceId }: DailyBriefingCardProps) {
  const [briefing, setBriefing] = useState<BriefingData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBriefing()
  }, [workspaceId])

  const fetchBriefing = async () => {
    try {
      const response = await fetch(`/api/owner/briefing?workspace_id=${workspaceId}`)
      const data = await response.json()
      if (data.error) {
        console.error('Briefing error:', data.error)
      } else {
        setBriefing(data)
      }
    } catch (error) {
      console.error('Failed to fetch briefing:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-zinc-800 rounded w-1/3"></div>
          <div className="h-4 bg-zinc-800 rounded w-2/3"></div>
          <div className="h-4 bg-zinc-800 rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  if (!briefing) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-semibold text-white">Daily CEO Briefing</h3>
        </div>
        <p className="text-zinc-400">No briefing available yet. Check back tomorrow at 6 AM.</p>
      </div>
    )
  }

  // Parse briefing sections (simple markdown-like parsing)
  const sections = briefing.briefing.split('---').map(s => s.trim()).filter(Boolean)

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-semibold text-white">Daily CEO Briefing</h3>
        </div>
        <div className="text-sm text-zinc-400">
          {new Date(briefing.date).toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'short', 
            day: 'numeric' 
          })}
        </div>
      </div>

      <div className="space-y-6">
        {sections.map((section, idx) => {
          const lines = section.split('\n')
          const title = lines[0]?.replace('##', '').trim() || ''
          const content = lines.slice(1).join('\n').trim()

          // Determine icon based on title
          let Icon = TrendingUp
          if (title.toLowerCase().includes('risk') || title.toLowerCase().includes('issue') || title.toLowerCase().includes('delay')) {
            Icon = AlertCircle
          } else if (title.toLowerCase().includes('complete') || title.toLowerCase().includes('good')) {
            Icon = CheckCircle2
          }

          return (
            <div key={idx} className="border-b border-zinc-800 pb-4 last:border-0 last:pb-0">
              <div className="flex items-start gap-3 mb-2">
                <Icon className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-semibold text-white mb-1">{title}</h4>
                  <p className="text-zinc-300 text-sm whitespace-pre-wrap">{content}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

























