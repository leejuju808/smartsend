'use client'

import { useEffect, useState } from 'react'
import { Bell, User, Building2, Moon, Sun, LogOut } from 'lucide-react'
import { createClientComponentClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { NotificationBell } from '@/components/notifications/bell'
import { OrgSwitcher } from '@/components/nav/OrgSwitcher'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { isSalesModeEnabled } from '@/lib/feature-flags'

interface HeaderBarProps {
  user?: {
    email?: string | null
    id?: string
  } | null
}

export function HeaderBar({ user }: HeaderBarProps) {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [darkMode, setDarkMode] = useState(false) // Future: implement dark mode
  const [systemState, setSystemState] = useState<'running' | 'paused' | 'unknown'>('unknown')

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const active = localStorage.getItem('active_workspace')
        if (!active) {
          if (mounted) setSystemState('unknown')
          return
        }

        const res = await fetch(`/api/outreach/status?workspace_id=${encodeURIComponent(active)}`, {
          cache: 'no-store',
        })
        const j = await res.json().catch(() => null)
        const state = String((j as any)?.outreach?.state || 'unknown')
        const normalized = state === 'running' ? 'running' : state === 'paused' ? 'paused' : 'unknown'
        if (mounted) setSystemState(normalized)
      } catch {
        if (mounted) setSystemState('unknown')
      }
    }

    load()
    const t = setInterval(load, 30000)
    return () => {
      mounted = false
      clearInterval(t)
    }
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const userInitial = user?.email?.charAt(0).toUpperCase() || 'U'

  return (
    <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      {/* Mobile menu button will be handled by parent */}
      
      <div className="flex flex-1 items-center justify-end gap-2">
        {/* Infrastructure status (quiet) */}
        <div
          className={cn(
            'hidden sm:inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
            systemState === 'running' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
            systemState === 'paused' && 'border-amber-200 bg-amber-50 text-amber-900',
            systemState === 'unknown' && 'border-gray-200 bg-gray-50 text-gray-700'
          )}
          title="System status"
        >
          {systemState === 'running'
            ? 'System running'
            : systemState === 'paused'
            ? 'System paused'
            : 'System status'}
        </div>

        {/* Notifications */}
        <NotificationBell />

        {/* Company Switcher (future multi-company) */}
        <OrgSwitcher />

        {/* BLOCK 281000 — Sales Mode: hide "coming soon" toggles */}
        {!isSalesModeEnabled() && (
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="Toggle dark mode"
            title="Dark mode (coming soon)"
          >
            {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        )}

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 p-1.5 rounded-md hover:bg-gray-100">
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-sm font-medium text-white">{userInitial}</span>
              </div>
              <span className="hidden sm:block text-sm font-medium text-gray-700">
                {user?.email}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user?.email}</span>
                <span className="text-xs text-gray-500">Account</span>
              </div>
            </DropdownMenuLabel>
            <div className="h-px bg-gray-200 my-1" />
            <DropdownMenuItem onClick={() => router.push('/dashboard/account')}>
              <User className="mr-2 h-4 w-4" />
              Account Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
              <Building2 className="mr-2 h-4 w-4" />
              Company Settings
            </DropdownMenuItem>
            <div className="h-px bg-gray-200 my-1" />
            <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

