'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface NavigationState {
  sidebarCollapsed: boolean
  lastOpenPage: string | null
  lastPipelineTab: string | null
  lastContactViewed: string | null
  lastSchedulerView: string | null
}

interface NavigationContextType {
  state: NavigationState
  setSidebarCollapsed: (collapsed: boolean) => void
  setLastOpenPage: (page: string) => void
  setLastPipelineTab: (tab: string) => void
  setLastContactViewed: (contactId: string) => void
  setLastSchedulerView: (view: string) => void
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined)

const STORAGE_KEY = 'smartsend_nav_state'

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NavigationState>(() => {
    if (typeof window === 'undefined') {
      return {
        sidebarCollapsed: false,
        lastOpenPage: null,
        lastPipelineTab: null,
        lastContactViewed: null,
        lastSchedulerView: null,
      }
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        return JSON.parse(stored)
      }
    } catch (e) {
      console.error('Failed to load navigation state:', e)
    }

    return {
      sidebarCollapsed: false,
      lastOpenPage: null,
      lastPipelineTab: null,
      lastContactViewed: null,
      lastSchedulerView: null,
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (e) {
      console.error('Failed to save navigation state:', e)
    }
  }, [state])

  const setSidebarCollapsed = (collapsed: boolean) => {
    setState((prev) => ({ ...prev, sidebarCollapsed: collapsed }))
  }

  const setLastOpenPage = (page: string) => {
    setState((prev) => ({ ...prev, lastOpenPage: page }))
  }

  const setLastPipelineTab = (tab: string) => {
    setState((prev) => ({ ...prev, lastPipelineTab: tab }))
  }

  const setLastContactViewed = (contactId: string) => {
    setState((prev) => ({ ...prev, lastContactViewed: contactId }))
  }

  const setLastSchedulerView = (view: string) => {
    setState((prev) => ({ ...prev, lastSchedulerView: view }))
  }

  return (
    <NavigationContext.Provider
      value={{
        state,
        setSidebarCollapsed,
        setLastOpenPage,
        setLastPipelineTab,
        setLastContactViewed,
        setLastSchedulerView,
      }}
    >
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider')
  }
  return context
}





















































