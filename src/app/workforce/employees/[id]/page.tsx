'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Edit, Plus, Award, BookOpen, FileText, CheckCircle, AlertTriangle, Calendar, MapPin } from 'lucide-react'
import { format, parseISO } from 'date-fns'

type Employee = {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  role: string | null
  skill_level: string | null
  status: string | null
  hire_date: string | null
  certifications?: Certification[]
  training_progress?: TrainingProgress[]
  performance_logs?: PerformanceLog[]
}

type Certification = {
  id: string
  cert_name: string
  cert_type: string
  issue_date: string
  expiry_date: string | null
  cert_file_url: string | null
}

type TrainingProgress = {
  id: string
  status: string
  completed_at: string | null
  module: {
    id: string
    title: string
    required_for_role: string | null
  }
}

type PerformanceLog = {
  id: string
  log_type: string
  notes: string
  created_at: string
}

type Tab = 'overview' | 'training' | 'certifications' | 'performance' | 'workload'

export default function EmployeeProfilePage() {
  const params = useParams()
  const router = useRouter()
  const employeeId = params.id as string
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)
  const [issueStats, setIssueStats] = useState<any>(null)
  const [workload, setWorkload] = useState<any>(null)

  useEffect(() => {
    if (employeeId) {
      loadEmployee()
    }
  }, [employeeId])

  const loadEmployee = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/workforce/employees/${employeeId}`)
      const data = await res.json()
      setEmployee(data.employee)

      // Load issue stats
      try {
        const statsRes = await fetch(`/api/workforce/employees/${employeeId}/issue-stats`)
        const statsData = await statsRes.json()
        setIssueStats(statsData)
      } catch (statsError) {
        console.error('Error loading issue stats:', statsError)
      }

      // Load workload
      try {
        const workloadRes = await fetch(`/api/workforce/employees/${employeeId}/workload`)
        const workloadData = await workloadRes.json()
        setWorkload(workloadData)
      } catch (workloadError) {
        console.error('Error loading workload:', workloadError)
      }
    } catch (error) {
      console.error('Error loading employee:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkTrainingComplete = async (moduleId: string) => {
    try {
      // TODO: Create API route for this
      await fetch(`/api/workforce/training/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          module_id: moduleId,
          status: 'completed',
          completed_at: new Date().toISOString(),
        }),
      })
      loadEmployee()
    } catch (error) {
      console.error('Error marking training complete:', error)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Loading employee...</div>
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Employee not found</div>
      </div>
    )
  }

  const tabs = [
    { id: 'overview' as Tab, label: 'Overview' },
    { id: 'training' as Tab, label: 'Training' },
    { id: 'certifications' as Tab, label: 'Certifications' },
    { id: 'performance' as Tab, label: 'Performance' },
    { id: 'workload' as Tab, label: 'Workload' },
  ]

  const requiredTrainingModules = employee.training_progress?.filter(
    (tp) => tp.module.required_for_role === employee.role || tp.module.required_for_role === 'everyone'
  ) || []
  const completedTraining = requiredTrainingModules.filter((tp) => tp.status === 'completed').length

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {employee.first_name} {employee.last_name}
          </h1>
          <p className="mt-1 text-sm text-gray-500 capitalize">
            {employee.role || '—'} · Skill: {employee.skill_level || 'Mid'}
          </p>
        </div>
        <div className="flex gap-2">
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${
              employee.status === 'active'
                ? 'bg-green-100 text-green-800'
                : employee.status === 'seasonal'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {employee.status || 'Active'}
          </span>
          <button className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </button>
          <Link
            href={`/workforce/employees/${employeeId}/performance/add`}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Performance Log
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left - Basic Info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Info</h2>
              <dl className="grid grid-cols-1 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Phone</dt>
                  <dd className="mt-1 text-sm text-gray-900">{employee.phone || '—'}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Email</dt>
                  <dd className="mt-1 text-sm text-gray-900">{employee.email || '—'}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Role</dt>
                  <dd className="mt-1 text-sm text-gray-900 capitalize">{employee.role || '—'}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Skill Level</dt>
                  <dd className="mt-1 text-sm text-gray-900 capitalize">{employee.skill_level || 'Mid'}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Status</dt>
                  <dd className="mt-1 text-sm text-gray-900 capitalize">{employee.status || 'Active'}</dd>
                </div>
                {employee.hire_date && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Start Date</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {new Date(employee.hire_date).toLocaleDateString()}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Right - Quick Status */}
          <div className="space-y-6">
            {/* Training */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">Training</h3>
                <BookOpen className="h-5 w-5 text-blue-600" />
              </div>
              <div className="mb-4">
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-gray-900">
                    {completedTraining}/{requiredTrainingModules.length}
                  </p>
                  <p className="text-sm text-gray-500">required modules</p>
                </div>
                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{
                      width: `${requiredTrainingModules.length > 0 ? (completedTraining / requiredTrainingModules.length) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <button
                onClick={() => setActiveTab('training')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                View Details
              </button>
            </div>

            {/* Certifications */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">Certifications</h3>
                <Award className="h-5 w-5 text-green-600" />
              </div>
              <div className="space-y-2 mb-4">
                {employee.certifications && employee.certifications.length > 0 ? (
                  employee.certifications.slice(0, 3).map((cert) => {
                    const daysUntilExpiry = cert.expiry_date
                      ? Math.ceil((new Date(cert.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                      : null
                    const isExpiring = daysUntilExpiry !== null && daysUntilExpiry <= 30

                    return (
                      <div key={cert.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-900">{cert.cert_name}</span>
                        {daysUntilExpiry !== null ? (
                          isExpiring ? (
                            <span className="text-orange-600">⚠️ {daysUntilExpiry}d</span>
                          ) : (
                            <span className="text-green-600">✅</span>
                          )
                        ) : (
                          <span className="text-green-600">✅</span>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <p className="text-sm text-gray-500">No certifications</p>
                )}
              </div>
              <button
                onClick={() => setActiveTab('certifications')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Add Certification
              </button>
            </div>

            {/* Issue Risk */}
            {issueStats && issueStats.total_issues > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900">Issue Risk</h3>
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-bold text-gray-900">
                      {issueStats.severe_issues > 0 ? '⚠' : '✓'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {issueStats.severe_issues > 0 ? 'Moderate' : 'Low'} Risk
                    </p>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <div>{issueStats.total_issues} total issues</div>
                    {issueStats.severe_issues > 0 && (
                      <div className="text-orange-600 font-medium">
                        {issueStats.severe_issues} severe (high/critical)
                      </div>
                    )}
                    {issueStats.critical_issues > 0 && (
                      <div className="text-red-600">Critical: {issueStats.critical_issues}</div>
                    )}
                    {issueStats.high_issues > 0 && (
                      <div className="text-orange-600">High: {issueStats.high_issues}</div>
                    )}
                  </div>
                  <Link
                    href={`/workforce/issues?employee_id=${employeeId}`}
                    className="mt-2 inline-block w-full text-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    View Issues →
                  </Link>
                </div>
              </div>
            )}

            {/* This Week's Workload */}
            {workload && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900">This Week's Schedule</h3>
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
                {workload.conflicts && workload.conflicts.length > 0 && (
                  <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                    <div className="flex items-center gap-1 text-yellow-900 font-medium mb-1">
                      <AlertTriangle className="h-3 w-3" />
                      Overbooking Warning
                    </div>
                    <div className="text-yellow-700">
                      {workload.conflicts.length} conflict{workload.conflicts.length !== 1 ? 's' : ''} detected
                    </div>
                  </div>
                )}
                <div className="space-y-2 mb-4">
                  {workload.assignments && workload.assignments.length > 0 ? (
                    workload.assignments.slice(0, 3).map((assignment: any) => (
                      <div key={assignment.id} className="text-sm">
                        <div className="font-medium text-gray-900">
                          {format(parseISO(assignment.assigned_date), 'MMM d')}
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          {assignment.job?.homeowner_name || 'Unnamed Job'}
                        </div>
                        {assignment.role_on_job && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            Role: {assignment.role_on_job}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No jobs assigned this week</p>
                  )}
                </div>
                <button
                  onClick={() => setActiveTab('workload')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  View Full Schedule
                </button>
              </div>
            )}

            {/* Recent Performance Logs */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent Performance</h3>
              <div className="space-y-3">
                {employee.performance_logs && employee.performance_logs.length > 0 ? (
                  employee.performance_logs.slice(0, 3).map((log) => (
                    <div key={log.id} className="text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                            log.log_type === 'praise'
                              ? 'bg-green-100 text-green-800'
                              : log.log_type === 'issue'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {log.log_type}
                        </span>
                        <span className="text-gray-500">
                          {new Date(log.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-gray-700">{log.notes}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No performance logs</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'training' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Training Modules</h2>
            <div className="flex gap-2">
              <select className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option>All</option>
                <option>Required</option>
                <option>Completed</option>
                <option>Not Started</option>
              </select>
            </div>
          </div>
          <div className="space-y-4">
            {employee.training_progress && employee.training_progress.length > 0 ? (
              employee.training_progress.map((tp) => (
                <div
                  key={tp.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{tp.module.title}</h3>
                      {(tp.module.required_for_role === employee.role ||
                        tp.module.required_for_role === 'everyone') && (
                        <span className="px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-100 rounded">
                          Required
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-500 capitalize">Status: {tp.status}</p>
                    {tp.completed_at && (
                      <p className="mt-1 text-xs text-gray-400">
                        Completed: {new Date(tp.completed_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {tp.status !== 'completed' && (
                    <button
                      onClick={() => handleMarkTrainingComplete(tp.module.id)}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Mark Completed
                    </button>
                  )}
                  {tp.status === 'completed' && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">No training modules assigned</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'certifications' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Certifications</h2>
            <button className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" />
              Add Certification
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Issue Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Expiry Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {employee.certifications && employee.certifications.length > 0 ? (
                  employee.certifications.map((cert) => {
                    const daysUntilExpiry = cert.expiry_date
                      ? Math.ceil((new Date(cert.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                      : null
                    const status =
                      !cert.expiry_date
                        ? 'Valid'
                        : daysUntilExpiry! > 30
                        ? 'Valid'
                        : daysUntilExpiry! > 0
                        ? 'Expiring Soon'
                        : 'Expired'

                    return (
                      <tr key={cert.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {cert.cert_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(cert.issue_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {cert.expiry_date ? new Date(cert.expiry_date).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              status === 'Valid'
                                ? 'bg-green-100 text-green-800'
                                : status === 'Expiring Soon'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {status}
                            {daysUntilExpiry !== null && daysUntilExpiry > 0 && ` (${daysUntilExpiry}d)`}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {cert.cert_file_url ? (
                            <a
                              href={cert.cert_file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              View
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                      No certifications yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Performance Logs</h2>
            <Link
              href={`/workforce/employees/${employeeId}/performance/add`}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Log
            </Link>
          </div>
          <div className="space-y-4">
            {employee.performance_logs && employee.performance_logs.length > 0 ? (
              employee.performance_logs.map((log) => (
                <div key={log.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium capitalize ${
                        log.log_type === 'praise'
                          ? 'bg-green-100 text-green-800'
                          : log.log_type === 'issue'
                          ? 'bg-red-100 text-red-800'
                          : log.log_type === 'attendance'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {log.log_type}
                    </span>
                    <span className="text-sm text-gray-500">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-900">{log.notes}</p>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">No performance logs yet</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'workload' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Workload & Schedule</h2>
            <Link
              href="/workforce/schedule"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <Calendar className="mr-2 h-4 w-4" />
              View Calendar
            </Link>
          </div>

          {/* Conflicts Warning */}
          {workload?.conflicts && workload.conflicts.length > 0 && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-yellow-900 mb-2">Schedule Conflicts Detected</p>
                  <div className="space-y-2">
                    {workload.conflicts.map((conflict: any, idx: number) => (
                      <div key={idx} className="text-sm text-yellow-700">
                        <strong>{conflict.employee_name}</strong> on{' '}
                        {format(parseISO(conflict.assigned_date), 'MMMM d, yyyy')} — Assigned to{' '}
                        {conflict.jobs_count} job{conflict.jobs_count !== 1 ? 's' : ''}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Assignments List */}
          <div className="space-y-4">
            {workload?.assignments && workload.assignments.length > 0 ? (
              workload.assignments.map((assignment: any) => (
                <div
                  key={assignment.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="font-medium text-gray-900">
                          {format(parseISO(assignment.assigned_date), 'EEEE, MMMM d, yyyy')}
                        </span>
                        {assignment.role_on_job && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium capitalize">
                            {assignment.role_on_job}
                          </span>
                        )}
                      </div>
                      <div className="ml-6 space-y-1">
                        <h3 className="font-semibold text-gray-900">
                          {assignment.job?.homeowner_name || 'Unnamed Job'}
                        </h3>
                        {assignment.job?.address && (
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <MapPin className="h-3 w-3" />
                            {assignment.job.address}
                          </div>
                        )}
                        {assignment.job?.job_type && (
                          <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                            {assignment.job.job_type}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-900">No jobs assigned</p>
                <p className="text-sm text-gray-500 mt-2">
                  This employee has no upcoming assignments.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
