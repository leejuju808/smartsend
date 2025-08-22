'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { 
  Mail, 
  LogOut, 
  User, 
  Settings, 
  Menu, 
  X,
  Zap,
  History,
  CreditCard,
  Gift,
  BarChart3,
  KanbanSquare,
  Users,
  Activity
} from 'lucide-react'
import { createClientComponentClient } from '@/lib/supabase'
import { canManageBilling } from '@/utils/permissions'
import FeedbackWidget from '@/components/FeedbackWidget'
import UpgradeNudgeModal from '@/components/billing/UpgradeNudgeModal'
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<any>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [quiet, setQuiet] = useState(false)
  const [ready, setReady] = useState(false)
  const [myRole, setMyRole] = useState<string | null>(null)
  
  const supabase = createClientComponentClient()
  const router = useRouter()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
      } else {
        setUser(user)
        const { data } = await supabase
          .from('onboarding_progress')
          .select('connected_mailbox, imported_leads, launched_sequence')
          .eq('user_id', user.id)
          .maybeSingle()
        if (data && data.connected_mailbox && data.imported_leads && data.launched_sequence) setReady(true)

        // Load role for active workspace (if any)
        try {
          const active = localStorage.getItem('active_workspace')
          if (active) {
            const { data: m } = await supabase
              .from('workspace_members')
              .select('role')
              .eq('workspace_id', active)
              .eq('user_id', user.id)
              .maybeSingle()
            setMyRole((m as any)?.role ?? null)
          }
        } catch {}
      }
      setLoading(false)
    }

    getUser()
  }, [supabase, router])

  useEffect(() => {
    // Local quiet hours banner: show midnight-6am local time
    const hour = new Date().getHours()
    setQuiet(hour < 6)
    const id = setInterval(() => {
      const h = new Date().getHours()
      setQuiet(h < 6)
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center">
              <Mail className="h-8 w-8 text-blue-600" />
              <span className="ml-2 text-xl font-bold text-gray-900">SmartSend</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            <Link
              href="/dashboard/overview"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <BarChart3 className="mr-3 h-5 w-5" />
              Overview
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-900 rounded-md hover:bg-gray-100"
            >
              <Zap className="mr-3 h-5 w-5" />
              Generate Emails
            </Link>
            <Link
              href="/dashboard/history"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <History className="mr-3 h-5 w-5" />
              Email History
            </Link>
            <Link
              href="/dashboard/logs"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <History className="mr-3 h-5 w-5" />
              Logs
            </Link>
            <Link
              href="/dashboard/account"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <User className="mr-3 h-5 w-5" />
              Account
            </Link>
            {canManageBilling(myRole) && (
              <Link
                href="/dashboard/billing"
                className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
              >
                <CreditCard className="mr-3 h-5 w-5" />
                Billing
              </Link>
            )}
            <Link
              href="/dashboard/referrals"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <Gift className="mr-3 h-5 w-5" />
              Referrals
            </Link>
            <Link
              href="/dashboard/deliverability"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <Settings className="mr-3 h-5 w-5" />
              Deliverability
            </Link>
            <Link
              href="/dashboard/campaigns"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <History className="mr-3 h-5 w-5" />
              Campaigns
            </Link>
            <Link
              href="/dashboard/pipeline"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <KanbanSquare className="mr-3 h-5 w-5" />
              Pipeline
            </Link>
            <Link
              href="/dashboard/team"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <Users className="mr-3 h-5 w-5" />
              Team
            </Link>
          </nav>
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                  <span className="text-sm font-medium text-white">
                    {user?.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="mt-3 flex w-full items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Sign out
            </button>
          </div>
          {ready && <span className="ml-auto text-xs rounded-full bg-green-100 text-green-700 px-2 py-1">Ready to Launch ✅</span>}
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
          <div className="flex h-16 items-center px-4">
            <Mail className="h-8 w-8 text-blue-600" />
            <span className="ml-2 text-xl font-bold text-gray-900">SmartSend</span>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            <WorkspaceSwitcher />
            <Link
              href="/dashboard/overview"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <BarChart3 className="mr-3 h-5 w-5" />
              Overview
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-900 rounded-md hover:bg-gray-100"
            >
              <Zap className="mr-3 h-5 w-5" />
              Generate Emails
            </Link>
            <Link
              href="/dashboard/history"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <History className="mr-3 h-5 w-5" />
              Email History
            </Link>
            <Link
              href="/dashboard/logs"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <History className="mr-3 h-5 w-5" />
              Logs
            </Link>
            {canManageBilling(myRole) && (
              <Link
                href="/dashboard/billing"
                className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
              >
                <CreditCard className="mr-3 h-5 w-5" />
                Billing
              </Link>
            )}
            <Link
              href="/dashboard/referrals"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <Gift className="mr-3 h-5 w-5" />
              Referrals
            </Link>
            <Link
              href="/dashboard/deliverability"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <Settings className="mr-3 h-5 w-5" />
              Deliverability
            </Link>
            <Link
              href="/dashboard/campaigns"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <Settings className="mr-3 h-5 w-5" />
              Campaigns
            </Link>
            <Link
              href="/dashboard/pipeline"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <KanbanSquare className="mr-3 h-5 w-5" />
              Pipeline
            </Link>
            <Link
              href="/dashboard/team"
              className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <Users className="mr-3 h-5 w-5" />
              Team
            </Link>
          </nav>
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                  <span className="text-sm font-medium text-white">
                    {user?.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="mt-3 flex w-full items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="hidden lg:block w-64">
            <WorkspaceSwitcher />
          </div>
          {ready && (
            <span className="ml-auto text-xs rounded-full bg-green-100 text-green-700 px-2 py-1">Ready to Launch ✅</span>
          )}
        </div>

        {quiet && (
          <div className="lg:pl-64">
            <div className="bg-yellow-50 border-y border-yellow-200 text-yellow-800 text-sm px-4 py-2">
              Sending resumes at 6am.
            </div>
          </div>
        )}

        <main className="py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
        <FeedbackWidget />
        <UpgradeNudgeModal />
      </div>
    </div>
  )
} 