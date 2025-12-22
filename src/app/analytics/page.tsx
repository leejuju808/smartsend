"use client"

import { useEffect, useState } from "react"
import { EmailKpis } from "@/components/analytics/EmailKpis"
import { EmailChart } from "@/components/analytics/EmailChart"

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/analytics/replies", { credentials: "include" })
        if (response.ok) {
          const json = await response.json()
          setData(json)
        }
      } catch (error) {
        console.error("Failed to fetch analytics:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading analytics...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Analytics</h1>
      <EmailKpis totals={data?.totals} />
      <EmailChart data={data?.series ?? []} />
    </div>
  )
}
