'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@/lib/supabase'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'
import { NavigationProvider } from '@/contexts/NavigationContext'
import { Sidebar } from '@/components/nav/Sidebar'
import { HeaderBar } from '@/components/nav/HeaderBar'
import { MobileNav } from '@/components/nav/MobileNav'
import { ProofOfDominanceTopLine } from '@/components/dashboard/ProofOfDominanceTopLine'
import { isCoachingUIEnabled } from '@/lib/feature-flags'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<any>(null)
  const [billingPaused, setBillingPaused] = useState(false)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [outreachState, setOutreachState] = useState<'running' | 'paused'>('running')
  const [outreachPausedAt, setOutreachPausedAt] = useState<string | null>(null)
  const [outreachPausedReason, setOutreachPausedReason] = useState<string | null>(null)
  const [outreachCanceled, setOutreachCanceled] = useState(false)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const supabase = createClientComponentClient()
  const router = useRouter()

  useEffect(() => {
    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      setUser(user)

      // Best-effort: enforce onboarding if needed.
      try {
        const coaching = isCoachingUIEnabled()
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_complete, team_id, subscription_status')
          .eq('id', user.id)
          .maybeSingle()

        const status = String((profile as any)?.subscription_status || '').toLowerCase()
        setBillingPaused(status === 'past_due' || status === 'unpaid')

        let shouldOnboard = false
        if (profile) {
          if (!(profile as any).onboarding_complete) {
            shouldOnboard = true
          } else if ((profile as any).team_id) {
            const { count } = await supabase
              .from('campaigns')
              .select('*', { count: 'exact', head: true })
              .eq('team_id', (profile as any).team_id)

            if (!count || count === 0) {
              shouldOnboard = true
            }
          }
        }

        // BLOCK 272500 — Internalization Sprint: no forced onboarding by default.
        if (coaching && shouldOnboard && !window.location.pathname.includes('/dashboard/onboarding')) {
          router.push('/dashboard/onboarding')
          return
        }
      } catch {
        // ignore
      }

      // BLOCK 269500+: Workspace-wide OFF switch (running/paused) is the source of truth.
      try {
        const active =
          localStorage.getItem('active_workspace') ||
          localStorage.getItem('workspace_id') ||
          localStorage.getItem('activeWorkspace') ||
          null

        if (active) {
          setWorkspaceId(active)
          const res = await fetch(`/api/outreach/status?workspace_id=${encodeURIComponent(active)}`, {
            cache: 'no-store',
          })
          const j = await res.json().catch(() => null)
          const pausedReason = String((j as any)?.outreach?.paused_reason || '')
          const state = String((j as any)?.outreach?.state || 'running')
          const pausedAt = ((j as any)?.outreach?.paused_at as string | null) ?? null

          setOutreachState(state === 'paused' ? 'paused' : 'running')
          setOutreachPausedReason(pausedReason || null)
          setOutreachPausedAt(pausedAt)

          setOutreachCanceled(state === 'paused' && pausedReason === 'billing_canceled')
        }
      } catch {
        setOutreachCanceled(false)
        setOutreachState('running')
        setOutreachPausedReason(null)
        setOutreachPausedAt(null)
      }

      setLoading(false)
    }

    run()
  }, [supabase, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const systemOff = billingPaused || outreachState === 'paused' || outreachCanceled

  async function resumeSmartSend() {
    if (!workspaceId) return
    setResumeLoading(true)
    setResumeError(null)
    try {
      const res = await fetch('/api/outreach/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, state: 'running' }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok || !(j as any)?.ok) {
        throw new Error(String((j as any)?.error || 'Failed to resume'))
      }
      window.location.reload()
    } catch (e: any) {
      setResumeError(e?.message || 'Failed to resume')
    } finally {
      setResumeLoading(false)
    }
  }

  // Non-negotiable rule: SmartSend OFF => zero dashboard output.
  if (systemOff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Business health</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
              SmartSend OFF
            </span>
            <span className="text-sm font-semibold text-gray-900">Business exposed.</span>
          </div>

          <div className="mt-4 text-xl font-semibold text-gray-900">No system running.</div>
          <div className="mt-2 text-sm text-gray-600">
            Forecasts, projections, capacity, cash timing, and hiring signals require SmartSend to be ON.
          </div>

          {outreachPausedReason ? (
            <div className="mt-3 text-xs text-gray-500">
              Reason: <span className="font-semibold text-gray-700">{outreachPausedReason}</span>
              {outreachPausedAt ? (
                <>
                  {' '}· Paused at{' '}
                  <span className="font-semibold text-gray-700">
                    {new Date(outreachPausedAt).toLocaleString()}
                  </span>
                </>
              ) : null}
            </div>
          ) : null}

          {workspaceId && outreachCanceled ? (
            <div className="mt-4 text-sm font-semibold text-gray-900">
              SmartSend is OFF (billing canceled).
            </div>
          ) : null}

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={resumeSmartSend}
              disabled={!workspaceId || resumeLoading || outreachCanceled}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {resumeLoading ? 'Resuming…' : 'Resume SmartSend'}
            </button>
            {resumeError ? <div className="text-sm font-semibold text-red-600">{resumeError}</div> : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <NavigationProvider>
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <MobileNav />

        <div className="lg:pl-64">
          <div className="sticky top-0 z-40 flex h-14 items-center border-b border-gray-200 bg-white px-4 shadow-sm sm:px-6 lg:px-8">
            <div className="hidden lg:block w-64">
              <WorkspaceSwitcher />
            </div>
            <div className="ml-auto">
              <div className="flex items-center gap-3">
                <div className="hidden sm:block">
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                    Business health: SmartSend ON
                  </span>
                </div>
                <HeaderBar user={user} />
              </div>
            </div>
          </div>

          <main className="py-6">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <ProofOfDominanceTopLine />
              {children}
            </div>
          </main>
        </div>
      </div>
    </NavigationProvider>
  )
}
