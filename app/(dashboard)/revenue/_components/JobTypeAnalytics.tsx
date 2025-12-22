"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Wrench, 
  Home, 
  AlertTriangle, 
  CloudRain, 
  Shield, 
  Droplets,
  Search,
  HelpCircle
} from "lucide-react"

type JobTypeData = {
  job_type: string
  job_count: number
  total_revenue: number
  revenue_won: number
  jobs_won: number
  avg_revenue: number
  avg_probability: number
}

interface JobTypeAnalyticsProps {
  data: JobTypeData[]
  dateRange?: string
}

const JOB_TYPE_LABELS: Record<string, string> = {
  roof_repair: "Repairs",
  roof_replacement: "Replacements",
  emergency_leak_repair: "Emergency Leaks",
  storm_damage: "Storm Damage",
  insurance_driven_claim: "Insurance Claims",
  gutter_repair_replacement: "Gutters",
  inspection_only: "Inspections",
  general_question: "Questions",
  not_roofing: "Not Roofing"
}

const JOB_TYPE_ICONS: Record<string, typeof Wrench> = {
  roof_repair: Wrench,
  roof_replacement: Home,
  emergency_leak_repair: AlertTriangle,
  storm_damage: CloudRain,
  insurance_driven_claim: Shield,
  gutter_repair_replacement: Droplets,
  inspection_only: Search,
  general_question: HelpCircle,
  not_roofing: HelpCircle
}

const JOB_TYPE_COLORS: Record<string, string> = {
  roof_repair: "text-blue-700 bg-blue-50 border-blue-200",
  roof_replacement: "text-purple-700 bg-purple-50 border-purple-200",
  emergency_leak_repair: "text-red-700 bg-red-50 border-red-200",
  storm_damage: "text-yellow-700 bg-yellow-50 border-yellow-200",
  insurance_driven_claim: "text-indigo-700 bg-indigo-50 border-indigo-200",
  gutter_repair_replacement: "text-cyan-700 bg-cyan-50 border-cyan-200",
  inspection_only: "text-gray-700 bg-gray-50 border-gray-200",
  general_question: "text-gray-600 bg-gray-50 border-gray-200",
  not_roofing: "text-gray-500 bg-gray-50 border-gray-200"
}

export function JobTypeAnalytics({ data, dateRange = "30d" }: JobTypeAnalyticsProps) {
  const totalJobs = data.reduce((sum, item) => sum + item.job_count, 0)
  const totalRevenue = data.reduce((sum, item) => sum + item.total_revenue, 0)
  const totalRevenueWon = data.reduce((sum, item) => sum + item.revenue_won, 0)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatPercent = (value: number) => {
    return `${Math.round(value)}%`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jobs by Type (Last {dateRange === "7d" ? "7" : dateRange === "30d" ? "30" : dateRange === "90d" ? "90" : "30"} Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4 pb-4 border-b">
            <div>
              <div className="text-sm text-muted-foreground">Total Jobs</div>
              <div className="text-2xl font-semibold">{totalJobs}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Revenue</div>
              <div className="text-2xl font-semibold">{formatCurrency(totalRevenue)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Revenue Won</div>
              <div className="text-2xl font-semibold text-green-600">{formatCurrency(totalRevenueWon)}</div>
            </div>
          </div>

          {/* Job Type Breakdown */}
          <div className="space-y-3">
            {data.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No job type data available
              </div>
            ) : (
              data.map((item) => {
                const Icon = JOB_TYPE_ICONS[item.job_type] || HelpCircle
                const colorClass = JOB_TYPE_COLORS[item.job_type] || "text-gray-600 bg-gray-50 border-gray-200"
                const winRate = item.job_count > 0 ? (item.jobs_won / item.job_count) * 100 : 0

                return (
                  <div
                    key={item.job_type}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded ${colorClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">
                          {JOB_TYPE_LABELS[item.job_type] || item.job_type}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {item.job_count} jobs • {formatCurrency(item.avg_revenue)} avg
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <div className="text-sm font-semibold">{formatCurrency(item.total_revenue)}</div>
                        <div className="text-xs text-muted-foreground">Total Value</div>
                      </div>
                      {item.revenue_won > 0 && (
                        <div>
                          <div className="text-sm font-semibold text-green-600">
                            {formatCurrency(item.revenue_won)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Won ({formatPercent(winRate)})
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}



















































