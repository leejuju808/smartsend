'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Progress } from '@/components/ui/progress'
import { CheckCircle2, Circle, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { createClientComponentClient } from '@/lib/supabase'

export interface OnboardingStep {
  id: string
  label: string
  href: string
  done: boolean
}

const DEFAULT_STEPS: Omit<OnboardingStep, 'done'>[] = [
  { id: 'connect_mailbox', label: 'Connect Mailbox', href: '/dashboard/settings/email' },
  { id: 'upload_leads', label: 'Upload Leads', href: '/dashboard/leads/import' },
  { id: 'create_campaign', label: 'Create First Campaign', href: '/campaigns/new' },
  { id: 'send_first_email', label: 'Send Test Email', href: '/campaigns/new' },
  { id: 'view_reply_inbox', label: 'Explore Reply Inbox', href: '/dashboard/replies' },
]

interface OnboardingChecklistProps {
  workspaceId?: string
  isTeamMember?: boolean
}

export function OnboardingChecklist({ workspaceId, isTeamMember = false }: OnboardingChecklistProps) {
  const [steps, setSteps] = useState<OnboardingStep[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClientComponentClient()

  useEffect(() => {
    async function loadChecklist() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        // Get workspace_id if not provided
        let wsId = workspaceId
        if (!wsId) {
          const { data: membership } = await supabase
            .from('workspace_members')
            .select('workspace_id')
            .eq('user_id', user.id)
            .limit(1)
            .single()
          
          wsId = membership?.workspace_id
        }

        if (!wsId) {
          setLoading(false)
          return
        }

        // Load onboarding status
        const { data: status } = await supabase
          .from('onboarding_status')
          .select('steps, completed')
          .eq('user_id', user.id)
          .eq('workspace_id', wsId)
          .single()

        // Merge default steps with status
        const stepMap = new Map<string, boolean>()
        if (status?.steps) {
          for (const step of status.steps as Array<{ id: string; done: boolean }>) {
            stepMap.set(step.id, step.done)
          }
        }

        const mergedSteps: OnboardingStep[] = DEFAULT_STEPS.map(step => ({
          ...step,
          done: stepMap.get(step.id) || false,
        }))

        // For team members, show different steps
        if (isTeamMember) {
          const teamSteps: Omit<OnboardingStep, 'done'>[] = [
            { id: 'explore_inbox', label: 'Explore Inbox', href: '/dashboard/replies' },
            { id: 'take_first_task', label: 'Take Your First Task', href: '/dashboard/tasks' },
            { id: 'review_assigned_leads', label: 'Review Assigned Leads', href: '/dashboard/leads' },
          ]
          const teamStepMap = new Map<string, boolean>()
          if (status?.steps) {
            for (const step of status.steps as Array<{ id: string; done: boolean }>) {
              teamStepMap.set(step.id, step.done)
            }
          }
          const mergedTeamSteps: OnboardingStep[] = teamSteps.map(step => ({
            ...step,
            done: teamStepMap.get(step.id) || false,
          }))
          setSteps(mergedTeamSteps)
        } else {
          setSteps(mergedSteps)
        }

        // Hide checklist if completed
        if (status?.completed) {
          setSteps([])
        }
      } catch (error) {
        console.error('Error loading checklist:', error)
      } finally {
        setLoading(false)
      }
    }

    loadChecklist()
  }, [supabase, workspaceId, isTeamMember])

  const { completed, total, percentage } = useMemo(() => {
    const completed = steps.filter(s => s.done).length
    const total = steps.length
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
    return { completed, total, percentage }
  }, [steps])

  if (loading || steps.length === 0) {
    return null
  }

  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-semibold">🚀 Getting Started</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">{completed}/{total}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {steps.map((step) => (
            <Link
              key={step.id}
              href={step.href}
              className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                step.done
                  ? 'opacity-60 hover:opacity-80'
                  : 'hover:bg-muted/50'
              }`}
            >
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              )}
              <span
                className={`text-sm ${
                  step.done
                    ? 'line-through text-muted-foreground'
                    : 'text-foreground'
                }`}
              >
                {step.label}
              </span>
            </Link>
          ))}
        </div>

        <div className="pt-2 border-t">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Progress</span>
            <span className="text-xs font-medium">{percentage}%</span>
          </div>
          <Progress value={percentage} className="h-2" />
        </div>
      </CardContent>
    </Card>
  )
}









