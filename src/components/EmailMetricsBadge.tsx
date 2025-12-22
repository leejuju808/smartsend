'use client'

import { useState, useEffect } from 'react'

interface OutreachMetrics {
  contacted: number
  responding: number
}

export default function EmailMetricsBadge() {
  const [metrics, setMetrics] = useState<OutreachMetrics>({ contacted: 0, responding: 0 })

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch("/api/metrics/replies?days=30", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        const contacted = Number(data?.totals?.sent ?? 0)
        const responding = Number(data?.totals?.replies ?? 0)
        setMetrics({ contacted, responding })
      } catch (error) {
        console.error('Failed to fetch outreach metrics:', error)
      }
    }
    
    fetchMetrics()
  }, [])

  return (
    <div className="text-sm text-gray-400">
      30d: Homeowners contacted {metrics.contacted} • Homeowners responding {metrics.responding}
    </div>
  )
}