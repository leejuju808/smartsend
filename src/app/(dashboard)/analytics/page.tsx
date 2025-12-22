/**
 * Block 23870 — SmartSend Roofing Analytics Page
 * Main analytics dashboard combining all views
 */

'use client'

import { useState } from 'react'
import RoofingDashboard from '@/components/analytics/RoofingDashboard'
import InsightsView from '@/components/analytics/InsightsView'
import RevenueView from '@/components/analytics/RevenueView'
import UpgradePrompts from '@/components/analytics/UpgradePrompts'

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'insights' | 'revenue'>('insights')

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Upgrade Prompts */}
      <div className="mb-6">
        <UpgradePrompts />
      </div>

      {/* Main Dashboard */}
      <div className="mb-8">
        <RoofingDashboard />
      </div>

      {/* Tabs for Secondary Views */}
      <div className="space-y-6">
        <div className="flex space-x-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('insights')}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'insights'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Insights
          </button>
          <button
            onClick={() => setActiveTab('revenue')}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'revenue'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Revenue
          </button>
        </div>

        {activeTab === 'insights' && <InsightsView />}
        {activeTab === 'revenue' && <RevenueView />}
      </div>
    </div>
  )
}
