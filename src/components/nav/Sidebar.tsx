'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  Mail,
  X,
  SlidersHorizontal,
  BarChart3,
} from 'lucide-react'
import { useNavigation } from '@/contexts/NavigationContext'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ReadyToSellBadge } from '@/components/sales/ReadyToSellBadge'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  tooltip: string
  requiredFeature?: string
  badge?: number | null
}

export function Sidebar() {
  const pathname = usePathname()
  const { state, setSidebarCollapsed } = useNavigation()
  const [cityAccess, setCityAccess] = useState<null | {
    status: "active" | "at_risk";
    market?: { city: string | null; state: string | null; market_key: string | null };
    copy?: { headline?: string; subtext?: string; early?: string };
  }>(null)

  // Fetch city access indicator (soft scarcity)
  useEffect(() => {
    const loadCityAccess = async () => {
      try {
        const res = await fetch("/api/city-access", { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json().catch(() => null)
        if (!json) return
        setCityAccess(json)
      } catch {
        // ignore
      }
    }
    loadCityAccess()
  }, [])

  // Main navigation items
  const mainItems: NavItem[] = [
    {
      label: 'Scoreboard',
      href: '/dashboard',
      icon: BarChart3,
      tooltip: "How's business? The only truth screen.",
      requiredFeature: undefined,
    },
    {
      label: 'OS',
      href: '/dashboard/os',
      icon: SlidersHorizontal,
      tooltip: "OS — Pull levers. Watch revenue move.",
      requiredFeature: undefined,
    },
  ]

  // Standardization Sprint (Block 269300):
  // Only show the daily operating loop in navigation.
  const outreachItems: NavItem[] = []
  const secondaryItems: NavItem[] = []

  // Filter items based on role permissions and inbox access
  const filterItems = (items: NavItem[]): NavItem[] => {
    return items.filter((item) => {
      if (!item.requiredFeature) return true
      return false
    })
  }

  const filteredMainItems = filterItems(mainItems)
  const filteredOutreachItems = filterItems(outreachItems)
  const filteredSecondaryItems = filterItems(secondaryItems)

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname?.startsWith(href) ?? false
  }

  const NavLink = ({ item }: { item: NavItem }) => {
    const Icon = item.icon
    const active = isActive(item.href)

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={item.href}
            className={cn(
              'flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors',
              active
                ? 'bg-blue-50 text-blue-700 border-l-2 border-blue-600'
                : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.badge !== undefined && item.badge !== null && item.badge > 0 && (
              <span className="ml-auto rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                {item.badge}
              </span>
            )}
          </Link>
        </TooltipTrigger>
        <TooltipContent>{item.tooltip}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200">
            <div className="flex items-center">
              <Mail className="h-8 w-8 text-blue-600" />
              <span className="ml-2 text-xl font-bold text-gray-900">SmartSend</span>
              <ReadyToSellBadge />
            </div>
            <button
              onClick={() => setSidebarCollapsed(!state.sidebarCollapsed)}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              aria-label="Collapse sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* City Access Indicator (Soft Scarcity) */}
          {cityAccess?.copy?.headline && (
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="text-xs font-semibold text-gray-900">{cityAccess.copy.headline}</div>
              {cityAccess.copy.subtext && (
                <div className="mt-1 text-[11px] text-gray-500">{cityAccess.copy.subtext}</div>
              )}
              {cityAccess.copy.early && (
                <div className="mt-1 text-[11px] text-gray-400">{cityAccess.copy.early}</div>
              )}
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
            {/* Main Items */}
            <div className="space-y-1">
              {filteredMainItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>

            {/* Outreach Grouping */}
            {filteredOutreachItems.length > 0 && (
              <div className="space-y-1">
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Send
                </div>
                {filteredOutreachItems.map((item) => (
                  <NavLink key={item.href} item={item} />
                ))}
              </div>
            )}

            {/* Secondary Items */}
            {filteredSecondaryItems.length > 0 && (
              <div className="space-y-1 mt-auto pt-6 border-t border-gray-200">
                {filteredSecondaryItems.map((item) => (
                  <NavLink key={item.href} item={item} />
                ))}
              </div>
            )}
          </nav>
        </div>
      </div>
    </TooltipProvider>
  )
}

