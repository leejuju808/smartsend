/**
 * Block 244000 — SmartSend Roofing Reporting & Insights Engine v1
 * THE BRAINS OF A ROOFING COMPANY
 */

'use client'

import { useEffect, useState } from 'react'
import ReportingEngineDashboard from '@/components/reports/ReportingEngineDashboard'
import RoofingKPIDashboard from '@/components/kpis/RoofingKPIDashboard'

export default function ReportsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)

  useEffect(() => {
    // Get workspace ID from URL or context
    const params = new URLSearchParams(window.location.search)
    const wsId = params.get('workspace_id') || localStorage.getItem('workspace_id')
    const compId = params.get('company_id')
    
    if (wsId) {
      setWorkspaceId(wsId)
    }
    
    if (compId) {
      setCompanyId(compId)
    }
  }, [])

  if (!workspaceId) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Reporting & Insights Engine</h1>
          <p className="text-lg text-gray-600 mt-2">
            Loading workspace...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <ReportingEngineDashboard 
        workspaceId={workspaceId} 
        companyId={companyId || undefined}
      />
    </div>
  )
}













