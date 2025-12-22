'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[]
  className?: string
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const pathname = usePathname()

  // Auto-generate breadcrumbs from pathname if not provided
  const generateBreadcrumbs = (): BreadcrumbItem[] => {
    if (items) return items

    const segments = pathname?.split('/').filter(Boolean) || []
    const breadcrumbs: BreadcrumbItem[] = [{ label: 'Home', href: '/dashboard' }]

    let currentPath = ''
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`
      const isLast = index === segments.length - 1

      // Format segment label
      const label = segment
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')

      breadcrumbs.push({
        label,
        href: isLast ? undefined : currentPath,
      })
    })

    return breadcrumbs
  }

  const breadcrumbItems = generateBreadcrumbs()

  if (breadcrumbItems.length <= 1) {
    return null
  }

  return (
    <nav className={cn('flex items-center space-x-2 text-sm text-gray-600', className)} aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2">
        {breadcrumbItems.map((item, index) => {
          const isLast = index === breadcrumbItems.length - 1

          return (
            <li key={item.href || item.label} className="flex items-center">
              {index === 0 ? (
                <Link
                  href={item.href || '#'}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <Home className="h-4 w-4" />
                </Link>
              ) : (
                <>
                  <ChevronRight className="h-4 w-4 text-gray-400 mx-2" />
                  {isLast ? (
                    <span className="text-gray-900 font-medium">{item.label}</span>
                  ) : (
                    <Link
                      href={item.href || '#'}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      {item.label}
                    </Link>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}





















































