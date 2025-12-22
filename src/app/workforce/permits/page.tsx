'use client'

// Block 257200 — Workforce Permit & Compliance Dashboard
// Shows:
// - Jobs blocked or at risk due to permit status
// - Permits expiring soon

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, ArrowLeft, ShieldAlert } from 'lucide-react'

type ReadinessRow = {
  job_id: string
  homeowner_name: string | null
  address: string | null
  job_type: string | null
  job_status: string
  permit_summary_status: string
  earliest_expiration: string | null
}

type ExpiringPermit = {
  id: string
  job_id: string
  permit_number: string | null
  issued_by: string | null
  expires_on: string
  homeowner_name: string | null
  address: string | null
}

export default function WorkforcePermitsDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [urgentJobs, setUrgentJobs] = useState<ReadinessRow[]>([])
  const [attentionJobs, setAttentionJobs] = useState<ReadinessRow[]>([])
  const [expiringPermits, setExpiringPermits] = useState<ExpiringPermit[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch('/api/workforce/permits/dashboard')
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load permit dashboard')
        }
        const data = await res.json()
        setUrgentJobs(data.urgentJobs || [])
        setAttentionJobs(data.attentionJobs || [])
        setExpiringPermits(data.expiringPermits || [])
      } catch (e: any) {
        console.error('Error loading workforce permit dashboard:', e)
        setError(e.message || 'Failed to load permit dashboard')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Approved
          </span>
        )
      case 'submitted':
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="mr-1 h-3 w-3" />
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        )
      case 'not_started':
      case 'expired':
      case 'rejected':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {status === 'not_started' ? 'Not Started' : status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {status}
          </span>
        )
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Loading permit dashboard...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="mb-4">
          <Link href="/workforce" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Workforce Hub
          </Link>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/workforce"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Workforce Hub
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldAlert className="h-7 w-7 text-orange-600" />
            Permit & Compliance Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            See every job’s permit status in one place so crews never start illegally or get shut down.
          </p>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Jobs Blocked</p>
              <p className="mt-2 text-3xl font-bold text-red-600">{urgentJobs.length}</p>
              <p className="mt-1 text-xs text-gray-500">Not started / expired / rejected permits</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Jobs Waiting on City</p>
              <p className="mt-2 text-3xl font-bold text-yellow-600">{attentionJobs.length}</p>
              <p className="mt-1 text-xs text-gray-500">Pending / submitted permits</p>
            </div>
            <Clock className="h-8 w-8 text-yellow-600" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Permits Expiring Soon</p>
              <p className="mt-2 text-3xl font-bold text-orange-600">{expiringPermits.length}</p>
              <p className="mt-1 text-xs text-gray-500">Within 10 days</p>
            </div>
            <ShieldAlert className="h-8 w-8 text-orange-600" />
          </div>
        </div>
      </div>

      {/* Blocked jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Jobs Blocked by Permits
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {urgentJobs.length === 0 ? (
              <div className="px-6 py-8 text-sm text-gray-500">
                No jobs are currently blocked by permits. Crews are safe to schedule.
              </div>
            ) : (
              urgentJobs.map((job) => (
                <div key={job.job_id} className="px-6 py-4 hover:bg-red-50/40">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">
                          {job.homeowner_name || 'Job ' + job.job_id.slice(0, 8)}
                        </span>
                        {renderStatusBadge(job.permit_summary_status)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {job.address || 'No address on file'}
                      </div>
                    </div>
                    <Link
                      href={`/workforce/jobs/${job.job_id}/documents`}
                      className="ml-4 inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      View Docs
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Attention jobs */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-600" />
              Jobs Waiting on City Approval
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {attentionJobs.length === 0 ? (
              <div className="px-6 py-8 text-sm text-gray-500">
                No jobs are currently waiting on permits. City is not holding you up right now.
              </div>
            ) : (
              attentionJobs.map((job) => (
                <div key={job.job_id} className="px-6 py-4 hover:bg-yellow-50/40">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">
                          {job.homeowner_name || 'Job ' + job.job_id.slice(0, 8)}
                        </span>
                        {renderStatusBadge(job.permit_summary_status)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {job.address || 'No address on file'}
                      </div>
                    </div>
                    <Link
                      href={`/workforce/jobs/${job.job_id}/documents`}
                      className="ml-4 inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      View Docs
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Permits expiring soon */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-orange-600" />
            Permits Expiring Soon
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          {expiringPermits.length === 0 ? (
            <div className="px-6 py-8 text-sm text-gray-500">
              No permits are expiring in the next 10 days.
            </div>
          ) : (
            expiringPermits.map((p) => (
              <div key={p.id} className="px-6 py-4 hover:bg-orange-50/40">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">
                        {p.permit_number || 'Permit ' + p.id.slice(0, 8)}
                      </span>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        Expires {new Date(p.expires_on).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {p.homeowner_name && <span>{p.homeowner_name} · </span>}
                      {p.address || 'No address on file'}
                      {p.issued_by && <span> · {p.issued_by}</span>}
                    </div>
                  </div>
                  <Link
                    href={`/workforce/jobs/${p.job_id}/documents`}
                    className="ml-4 inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    View Job
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}















