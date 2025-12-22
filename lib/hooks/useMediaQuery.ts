'use client'

import { useState, useEffect } from 'react'

/**
 * Hook to detect if viewport matches a media query
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(query)
    setMatches(mediaQuery.matches)

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [query])

  return matches
}

/**
 * Hook to detect if device is mobile (< 768px)
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}

/**
 * Hook to detect if device is tablet (768px - 1024px)
 */
export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 768px) and (max-width: 1024px)')
}

/**
 * Hook to detect if device is desktop (> 1024px)
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1025px)')
}



















































