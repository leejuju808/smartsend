'use client'

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import { createClientComponentClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface MagicSetupProps {
  workspaceId?: string
}

export function MagicSetup({ workspaceId }: MagicSetupProps) {
  const [loading, setLoading] = useState(false)
  const supabase = createClientComponentClient()
  const router = useRouter()

  const handleMagicSetup = async () => {
    setLoading(true)
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

      // Call magic setup API
      const response = await fetch('/api/onboarding/magic-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: wsId }),
      })

      if (!response.ok) {
        throw new Error('Magic setup failed')
      }

      const data = await response.json()

      // Mark onboarding steps as done
      const steps = [
        'upload_leads',
        'create_campaign',
        'send_first_email',
      ]

      for (const stepId of steps) {
        await supabase.rpc('mark_onboarding_step_done', {
          p_user_id: user.id,
          p_workspace_id: wsId,
          p_step_id: stepId,
        })
      }

      // Redirect to campaign or show success
      if (data.campaignId) {
        router.push(`/dashboard/campaigns/${data.campaignId}`)
      } else {
        router.push('/dashboard')
      }
    } catch (error) {
      console.error('Magic setup error:', error)
      alert('Magic setup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="rounded-xl border bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>Magic Setup</CardTitle>
        </div>
        <CardDescription>
          One-click setup: We'll create an example segment, sample campaign, and 3-email sequence to get you started.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          onClick={handleMagicSetup}
          disabled={loading}
          className="w-full"
          variant="default"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Setting up...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Run Magic Setup
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          This will create sample data to help you understand how SmartSend works
        </p>
      </CardContent>
    </Card>
  )
}









