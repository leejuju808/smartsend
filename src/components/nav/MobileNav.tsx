'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function MobileNav() {
  const pathname = usePathname()

  // Core tabs (always visible in bottom bar)
  const coreTabs = [
    {
      label: 'OS',
      href: '/dashboard/os',
      icon: SlidersHorizontal,
      requiredFeature: undefined,
    },
  ]

  const filteredCoreTabs = coreTabs

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname?.startsWith(href) ?? false
  }

  return (
    <>
      {/* Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 lg:hidden">
        <div className="flex items-center justify-around h-16">
          {filteredCoreTabs.map((tab) => {
            const Icon = tab.icon
            const active = isActive(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full',
                  active ? 'text-blue-600' : 'text-gray-500'
                )}
              >
                <Icon className="h-5 w-5 mb-1" />
                <span className="text-xs font-medium">{tab.label}</span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Menu intentionally removed for standardization */}
    </>
  )
}



