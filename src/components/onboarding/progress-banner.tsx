'use client'

import { useEffect, useState } from 'react'
import { Sparkles, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import { createClientComponentClient } from '@/lib/supabase'

interface ProgressBannerProps {
  workspaceId?: string
}

const DEFAULT_STEPS = [
  { id: 'connect_mailbox', label: 'Connect your mailbox', href: '/dashboard/settings/email' },
  { id: 'upload_leads', label: 'Upload your leads', href: '/dashboard/leads/import' },
  { id: 'create_campaign', label: 'Create your first campaign', href: '/campaigns/new' },
  { id: 'send_first_email', label: 'Send a test email', href: '/campaigns/new' },
  { id: 'view_reply_inbox', label: 'Explore reply inbox', href: '/dashboard/replies' },
]

export function ProgressBanner({ workspaceId }: ProgressBannerProps) {
  const [percentage, setPercentage] = useState(0)
  const [nextStep, setNextStep] = useState<{ label: string; href: string } | null>(null)
  const [visible, setVisible] = useState(false)
  const supabase = createClientComponentClient()

  useEffect(() => {
    async function loadProgress() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

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

        if (!wsId) return

        const { data: status } = await supabase
          .from('onboarding_status')
          .select('steps, completed')
          .eq('user_id', user.id)
          .eq('workspace_id', wsId)
          .single()

        if (status?.completed) {
          setVisible(false)
          return
        }

        const stepMap = new Map<string, boolean>()
        if (status?.steps) {
          for (const step of status.steps as Array<{ id: string; done: boolean }>) {
            stepMap.set(step.id, step.done)
          }
        }

        const completed = DEFAULT_STEPS.filter(s => stepMap.get(s.id)).length
        const total = DEFAULT_STEPS.length
        const pct = Math.round((completed / total) * 100)

        setPercentage(pct)

        // Find next incomplete step
        const incomplete = DEFAULT_STEPS.find(s => !stepMap.get(s.id))
        if (incomplete) {
          setNextStep({ label: incomplete.label, href: incomplete.href })
          setVisible(true)
        } else {
          setVisible(false)
        }
      } catch (error) {
        console.error('Error loading progress:', error)
      }
    }

    loadProgress()
  }, [supabase, workspaceId])

  if (!visible || !nextStep) {
    return null
  }

  return (
    <div className="border-b bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">
                You're {percentage}% set up!
              </p>
              <p className="text-xs text-muted-foreground">
                Complete your next step: {nextStep.label}
              </p>
            </div>
          </div>
          <Link href={nextStep.href}>
            <Button variant="default" size="sm">
              Get Started
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}









