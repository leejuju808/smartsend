'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { 
  Shield, 
  CheckCircle, 
  AlertCircle, 
  XCircle, 
  Clock,
  TrendingUp,
  TrendingDown
} from 'lucide-react'

type ComplianceRecord = {
  employee_id: string
  employee_name: string
  role: string
  fall_protection_status: string
  fall_protection_expires_at: string | null
  ladder_safety_status: string
  ladder_safety_expires_at: string | null
  ppe_status: string
  ppe_expires_at: string | null
  heat_safety_status: string
  heat_safety_expires_at: string | null
  completion_percentage: number
  safety_score: number
}

export default function OSHACompliancePage() {
  const [compliance, setCompliance] = useState<ComplianceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'compliant' | 'expiring' | 'expired' | 'at_risk'>('all')

  useEffect(() => {
    loadCompliance()
  }, [])

  const loadCompliance = async () => {
    try {
      const res = await fetch('/api/safety/compliance')
      const data = await res.json()
      if (data.compliance) {
        setCompliance(data.compliance)
      }
    } catch (error) {
      console.error('Error loading compliance data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string, expiresAt: string | null) => {
    if (status === 'completed') {
      if (expiresAt) {
        const expires = new Date(expiresAt)
        const daysUntilExpiry = Math.ceil((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        if (daysUntilExpiry < 0) return 'text-red-600 bg-red-50'
        if (daysUntilExpiry < 30) return 'text-yellow-600 bg-yellow-50'
        return 'text-green-600 bg-green-50'
      }
      return 'text-green-600 bg-green-50'
    }
    if (status === 'expired') return 'text-red-600 bg-red-50'
    if (status === 'in_progress') return 'text-blue-600 bg-blue-50'
    return 'text-gray-600 bg-gray-50'
  }

  const getStatusIcon = (status: string, expiresAt: string | null) => {
    if (status === 'completed') {
      if (expiresAt) {
        const expires = new Date(expiresAt)
        const daysUntilExpiry = Math.ceil((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        if (daysUntilExpiry < 0) return <XCircle className="h-4 w-4" />
        if (daysUntilExpiry < 30) return <AlertCircle className="h-4 w-4" />
        return <CheckCircle className="h-4 w-4" />
      }
      return <CheckCircle className="h-4 w-4" />
    }
    if (status === 'expired') return <XCircle className="h-4 w-4" />
    if (status === 'in_progress') return <Clock className="h-4 w-4" />
    return <AlertCircle className="h-4 w-4" />
  }

  const getSafetyScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-50'
    if (score >= 80) return 'text-blue-600 bg-blue-50'
    if (score >= 70) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
  }

  const getSafetyScoreLabel = (score: number) => {
    if (score >= 90) return 'Elite'
    if (score >= 80) return 'Safe'
    if (score >= 70) return 'Caution'
    return 'At Risk'
  }

  const filteredCompliance = compliance.filter((record) => {
    if (filter === 'all') return true
    if (filter === 'compliant') {
      return record.completion_percentage === 100 && record.safety_score >= 80
    }
    if (filter === 'expiring') {
      const hasExpiring = [
        record.fall_protection_expires_at,
        record.ladder_safety_expires_at,
        record.ppe_expires_at,
        record.heat_safety_expires_at,
      ].some((exp) => {
        if (!exp) return false
        const days = Math.ceil((new Date(exp).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        return days > 0 && days <= 30
      })
      return hasExpiring
    }
    if (filter === 'expired') {
      const hasExpired = [
        record.fall_protection_status,
        record.ladder_safety_status,
        record.ppe_status,
        record.heat_safety_status,
      ].includes('expired')
      return hasExpired
    }
    if (filter === 'at_risk') {
      return record.safety_score < 70
    }
    return true
  })

  const stats = {
    total: compliance.length,
    compliant: compliance.filter((r) => r.completion_percentage === 100 && r.safety_score >= 80).length,
    expiring: compliance.filter((r) => {
      const hasExpiring = [
        r.fall_protection_expires_at,
        r.ladder_safety_expires_at,
        r.ppe_expires_at,
        r.heat_safety_expires_at,
      ].some((exp) => {
        if (!exp) return false
        const days = Math.ceil((new Date(exp).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        return days > 0 && days <= 30
      })
      return hasExpiring
    }).length,
    expired: compliance.filter((r) => {
      return [
        r.fall_protection_status,
        r.ladder_safety_status,
        r.ppe_status,
        r.heat_safety_status,
      ].includes('expired')
    }).length,
    atRisk: compliance.filter((r) => r.safety_score < 70).length,
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Loading compliance data...</div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">OSHA Compliance Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track training compliance, expiration dates, and crew safety scores
          </p>
        </div>
        <Link
          href="/workforce/safety"
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          Back to Safety
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500">Total Employees</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm text-green-600">Compliant</div>
          <div className="text-2xl font-bold text-green-900 mt-1">{stats.compliant}</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-sm text-yellow-600">Expiring Soon</div>
          <div className="text-2xl font-bold text-yellow-900 mt-1">{stats.expiring}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-sm text-red-600">Expired</div>
          <div className="text-2xl font-bold text-red-900 mt-1">{stats.expired}</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="text-sm text-orange-600">At Risk</div>
          <div className="text-2xl font-bold text-orange-900 mt-1">{stats.atRisk}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'compliant', 'expiring', 'expired', 'at_risk'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {f === 'all' ? 'All' : f === 'compliant' ? 'Compliant' : f === 'expiring' ? 'Expiring' : f === 'expired' ? 'Expired' : 'At Risk'}
          </button>
        ))}
      </div>

      {/* Compliance Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fall Protection
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ladder Safety
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PPE
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Heat Safety
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Completion %
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Safety Score
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCompliance.map((record) => (
                <tr key={record.employee_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{record.employee_name}</div>
                      <div className="text-sm text-gray-500 capitalize">{record.role}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(record.fall_protection_status, record.fall_protection_expires_at)}`}>
                      {getStatusIcon(record.fall_protection_status, record.fall_protection_expires_at)}
                      {record.fall_protection_status === 'completed' && record.fall_protection_expires_at
                        ? `${Math.ceil((new Date(record.fall_protection_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}d`
                        : record.fall_protection_status}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(record.ladder_safety_status, record.ladder_safety_expires_at)}`}>
                      {getStatusIcon(record.ladder_safety_status, record.ladder_safety_expires_at)}
                      {record.ladder_safety_status === 'completed' && record.ladder_safety_expires_at
                        ? `${Math.ceil((new Date(record.ladder_safety_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}d`
                        : record.ladder_safety_status}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(record.ppe_status, record.ppe_expires_at)}`}>
                      {getStatusIcon(record.ppe_status, record.ppe_expires_at)}
                      {record.ppe_status === 'completed' && record.ppe_expires_at
                        ? `${Math.ceil((new Date(record.ppe_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}d`
                        : record.ppe_status}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(record.heat_safety_status, record.heat_safety_expires_at)}`}>
                      {getStatusIcon(record.heat_safety_status, record.heat_safety_expires_at)}
                      {record.heat_safety_status === 'completed' && record.heat_safety_expires_at
                        ? `${Math.ceil((new Date(record.heat_safety_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}d`
                        : record.heat_safety_status}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{record.completion_percentage.toFixed(0)}%</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getSafetyScoreColor(record.safety_score)}`}>
                      {record.safety_score}
                      <span className="text-xs">({getSafetyScoreLabel(record.safety_score)})</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredCompliance.length === 0 && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No employees found</h3>
          <p className="text-gray-500">Try adjusting your filters</p>
        </div>
      )}
    </div>
  )
}
























