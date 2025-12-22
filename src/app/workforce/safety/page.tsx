'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Shield, AlertTriangle, CheckCircle, Users, Plus, FileText, AlertCircle } from 'lucide-react'

type SafetyStats = {
  talks_completed_this_week: number
  employees_missing_signoffs: number
  recent_incidents: number
  safety_risk_score: number
}

type MissingSignoff = {
  employee_id: string
  first_name: string
  last_name: string
  role: string
  last_signoff_date: string | null
}

type RecentIncident = {
  id: string
  date: string
  incident_type: string
  severity: string
  description: string
  employee_id: string | null
  workforce_employees: {
    first_name: string
    last_name: string
  } | null
}

export default function SafetyDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<SafetyStats>({
    talks_completed_this_week: 0,
    employees_missing_signoffs: 0,
    recent_incidents: 0,
    safety_risk_score: 0,
  })
  const [missingSignoffs, setMissingSignoffs] = useState<MissingSignoff[]>([])
  const [recentIncidents, setRecentIncidents] = useState<RecentIncident[]>([])

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch('/api/workforce/safety/dashboard')
        const data = await res.json()

        if (data.stats) {
          setStats(data.stats)
        }
        if (data.missingSignoffs) {
          setMissingSignoffs(data.missingSignoffs)
        }
        if (data.recentIncidents) {
          setRecentIncidents(data.recentIncidents)
        }
      } catch (error) {
        console.error('Error loading safety data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const getRiskScoreColor = (score: number) => {
    if (score === 0) return 'text-green-600'
    if (score < 20) return 'text-yellow-600'
    if (score < 50) return 'text-orange-600'
    return 'text-red-600'
  }

  const getRiskScoreLabel = (score: number) => {
    if (score === 0) return 'Excellent'
    if (score < 20) return 'Good'
    if (score < 50) return 'Warning'
    return 'Critical'
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800'
      case 'high':
        return 'bg-orange-100 text-orange-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-blue-100 text-blue-800'
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Loading safety data...</div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Safety System</h1>
          <p className="mt-1 text-sm text-gray-500">
            Toolbox Talks, Digital Sign-Offs, Safety Logs, Crew Safety Compliance
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/workforce/safety/incidents/new"
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Plus className="mr-2 h-4 w-4" />
            Report Incident
          </Link>
          <Link
            href="/workforce/safety/talks"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Toolbox Talk
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Talks Completed This Week */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Talks Completed This Week</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{stats.talks_completed_this_week}</p>
              <Link
                href="/workforce/safety/talks"
                className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                View all talks →
              </Link>
            </div>
            <FileText className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        {/* Employees Missing Sign-Offs */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Missing Sign-Offs</p>
              <p className="mt-2 text-3xl font-bold text-orange-600">
                {stats.employees_missing_signoffs}
              </p>
              <p className="mt-1 text-xs text-gray-500">No sign-off in last 7 days</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-orange-600" />
          </div>
        </div>

        {/* Recent Incidents */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Recent Incidents</p>
              <p className="mt-2 text-3xl font-bold text-red-600">{stats.recent_incidents}</p>
              <p className="mt-1 text-xs text-gray-500">Last 7 days</p>
            </div>
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
        </div>

        {/* Safety Risk Score */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Safety Risk Score</p>
              <p className={`mt-2 text-3xl font-bold ${getRiskScoreColor(stats.safety_risk_score)}`}>
                {stats.safety_risk_score}
              </p>
              <p className="mt-1 text-xs text-gray-500">{getRiskScoreLabel(stats.safety_risk_score)}</p>
            </div>
            <Shield className={`h-8 w-8 ${getRiskScoreColor(stats.safety_risk_score)}`} />
          </div>
        </div>
      </div>

      {/* Main Content - Two Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left - Missing Sign-Offs */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Employees Missing Sign-Offs</h2>
              <Link
                href="/workforce/safety/talks"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Start Talk →
              </Link>
            </div>
          </div>
          <div className="p-6">
            {missingSignoffs.length > 0 ? (
              <div className="space-y-3">
                {missingSignoffs.slice(0, 10).map((employee) => (
                  <div
                    key={employee.employee_id}
                    className="flex items-center justify-between p-3 bg-orange-50 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {employee.first_name} {employee.last_name}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">{employee.role}</p>
                    </div>
                    <span className="text-xs text-orange-600 font-medium">
                      {employee.last_signoff_date
                        ? `Last: ${new Date(employee.last_signoff_date).toLocaleDateString()}`
                        : 'Never'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-gray-500">All employees are up to date!</p>
              </div>
            )}
          </div>
        </div>

        {/* Right - Recent Incidents */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Incidents</h2>
              <Link
                href="/workforce/safety/incidents"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                View all →
              </Link>
            </div>
          </div>
          <div className="p-6">
            {recentIncidents.length > 0 ? (
              <div className="space-y-3">
                {recentIncidents.map((incident) => (
                  <div
                    key={incident.id}
                    className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/workforce/safety/incidents/${incident.id}`)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded-full ${getSeverityColor(
                              incident.severity
                            )}`}
                          >
                            {incident.severity.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-500 capitalize">
                            {incident.incident_type.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-sm text-gray-900 line-clamp-2">{incident.description}</p>
                        {incident.workforce_employees && (
                          <p className="text-xs text-gray-500 mt-1">
                            {incident.workforce_employees.first_name}{' '}
                            {incident.workforce_employees.last_name}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 ml-2">
                        {new Date(incident.date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No incidents in the last 7 days</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
























