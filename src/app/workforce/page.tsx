'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Users, FileText, Award, AlertTriangle } from 'lucide-react'

type Employee = {
  id: string
  first_name: string
  last_name: string
  role: string | null
  status: string | null
}

type Stats = {
  totalEmployees: number
  activeApplicants: number
  trainingCompletion: number
  expiringCertifications: number
  roleBreakdown: Record<string, number>
  applicantsBreakdown: { inInterview: number; new: number }
}

export default function WorkforceOverviewPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({
    totalEmployees: 0,
    activeApplicants: 0,
    trainingCompletion: 0,
    expiringCertifications: 0,
    roleBreakdown: {},
    applicantsBreakdown: { inInterview: 0, new: 0 },
  })
  const [employees, setEmployees] = useState<Employee[]>([])
  const [trainingAlerts, setTrainingAlerts] = useState<any[]>([])
  const [certAlerts, setCertAlerts] = useState<any[]>([])
  const [complianceData, setComplianceData] = useState<any>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load employees
        const empRes = await fetch('/api/workforce/employees?status=active')
        const empData = await empRes.json()
        const activeEmployees = empData.employees || []

        // Load applicants
        const appRes = await fetch('/api/workforce/applicants')
        const appData = await appRes.json()
        const applicants = appData.applicants || []

        // Load compliance data
        const complianceRes = await fetch('/api/workforce/compliance')
        const compliance = await complianceRes.json()
        setComplianceData(compliance)

        // Calculate role breakdown
        const roleBreakdown: Record<string, number> = {}
        activeEmployees.forEach((e: Employee) => {
          const role = e.role || 'other'
          roleBreakdown[role] = (roleBreakdown[role] || 0) + 1
        })

        // Calculate applicant breakdown
        const applicantsBreakdown = {
          inInterview: applicants.filter((a: any) => a.status === 'interview').length,
          new: applicants.filter((a: any) => a.status === 'new').length,
        }

        // Calculate training completion from compliance data
        const trainingSummary = compliance.training?.summary || { high: 0, medium: 0, low: 0, none_required: 0 }
        const totalTrainingEmployees = trainingSummary.high + trainingSummary.medium + trainingSummary.low + trainingSummary.none_required
        const completedTrainingEmployees = trainingSummary.low + trainingSummary.none_required
        const trainingCompletion = totalTrainingEmployees > 0 
          ? Math.round((completedTrainingEmployees / totalTrainingEmployees) * 100)
          : 100

        // Calculate expiring certifications
        const certSummary = compliance.certifications?.summary || { expired: 0, expiring_7: 0, expiring_30: 0, valid: 0 }
        const expiringCertifications = certSummary.expired + certSummary.expiring_7 + certSummary.expiring_30

        setStats({
          totalEmployees: activeEmployees.length,
          activeApplicants: applicants.length,
          trainingCompletion,
          expiringCertifications,
          roleBreakdown,
          applicantsBreakdown,
        })

        setEmployees(activeEmployees.slice(0, 10)) // Top 10 for quick view

        // Build training alerts from high-risk employees
        const highRiskTraining = compliance.training?.data?.filter((t: any) => t.risk_level === 'high') || []
        setTrainingAlerts(
          highRiskTraining.slice(0, 5).map((t: any) => ({
            message: `${t.first_name} ${t.last_name} - ${t.completion_percent}% complete (${t.completed_required}/${t.total_required} required)`,
            employeeId: t.employee_id,
          }))
        )

        // Build cert alerts from expired/expiring certs
        const riskCerts = compliance.certifications?.data?.filter(
          (c: any) => c.status === 'expired' || c.status === 'expiring_7' || c.status === 'expiring_30'
        ) || []
        setCertAlerts(
          riskCerts.slice(0, 5).map((c: any) => ({
            message: `${c.first_name} ${c.last_name} - ${c.cert_name} (${c.status.toUpperCase()})`,
            employeeId: c.employee_id,
            certificationId: c.certification_id,
          }))
        )
      } catch (error) {
        console.error('Error loading workforce data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const formatRoleBreakdown = () => {
    const parts: string[] = []
    if (stats.roleBreakdown.foreman) parts.push(`${stats.roleBreakdown.foreman} foremen`)
    if (stats.roleBreakdown.installer) parts.push(`${stats.roleBreakdown.installer} installers`)
    if (stats.roleBreakdown.laborer) parts.push(`${stats.roleBreakdown.laborer} laborers`)
    return parts.join(' · ') || 'No breakdown'
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Loading workforce data...</div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Workforce Hub</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your team, training, and compliance</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/workforce/applicants"
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Applicant
          </Link>
          <Link
            href="/workforce/employees"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Employee
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Employees */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Employees</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{stats.totalEmployees}</p>
              <p className="mt-1 text-xs text-gray-500">{formatRoleBreakdown()}</p>
            </div>
            <Users className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        {/* Active Applicants */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Active Applicants</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{stats.activeApplicants}</p>
              <p className="mt-1 text-xs text-gray-500">
                {stats.applicantsBreakdown.inInterview} in interview · {stats.applicantsBreakdown.new} new
              </p>
            </div>
            <FileText className="h-8 w-8 text-green-600" />
          </div>
        </div>

        {/* Training Completion */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-500">Training Completion</p>
              <div className="mt-2">
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-gray-900">{stats.trainingCompletion}%</p>
                </div>
                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${stats.trainingCompletion}%` }}
                  />
                </div>
                {complianceData?.training?.summary && (
                  <p className="mt-1 text-xs text-gray-500">
                    {complianceData.training.summary.low} low risk · {complianceData.training.summary.medium} medium · {complianceData.training.summary.high} high risk
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Expiring Certifications */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Certification Risk</p>
              <p className="mt-2 text-3xl font-bold text-orange-600">{stats.expiringCertifications}</p>
              {complianceData?.certifications?.summary && (
                <p className="mt-1 text-xs text-gray-500">
                  {complianceData.certifications.summary.expired} expired · {complianceData.certifications.summary.expiring_30} expiring
                </p>
              )}
            </div>
            <AlertTriangle className="h-8 w-8 text-orange-600" />
          </div>
        </div>
      </div>

      {/* Main Content - Two Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left - People Status (60%) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">People Status</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Training
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Certifications
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {employees.map((employee) => (
                  <tr
                    key={employee.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/workforce/employees/${employee.id}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {employee.first_name} {employee.last_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500 capitalize">{employee.role || '—'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 capitalize">
                        {employee.status || 'active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">—</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">—</td>
                  </tr>
                ))}
                {employees.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                      No employees yet. <Link href="/workforce/employees" className="text-blue-600 hover:underline">Add your first employee</Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {employees.length > 0 && (
            <div className="p-4 border-t border-gray-200 text-center">
              <Link
                href="/workforce/employees"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                View all employees →
              </Link>
            </div>
          )}
        </div>

        {/* Right - Alerts & To-Dos (40%) */}
        <div className="space-y-4">
          {/* Training Alerts */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Training Alerts</h3>
            </div>
            <div className="p-4">
              {trainingAlerts.length > 0 ? (
                <ul className="space-y-3">
                  {trainingAlerts.map((alert, idx) => (
                    <li key={idx} className="text-sm text-gray-600">
                      {alert.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No training alerts</p>
              )}
              <Link
                href="/workforce/training"
                className="mt-4 inline-block w-full text-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                View Training
              </Link>
            </div>
          </div>

          {/* Certification Alerts */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Certification Alerts</h3>
            </div>
            <div className="p-4">
              {certAlerts.length > 0 ? (
                <ul className="space-y-3">
                  {certAlerts.map((alert, idx) => (
                    <li key={idx} className="text-sm text-gray-600">
                      {alert.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No certification alerts</p>
              )}
              <Link
                href="/workforce/certifications"
                className="mt-4 inline-block w-full text-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                View Certifications
              </Link>
            </div>
          </div>

          {/* Suppliers & Vendors */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Suppliers & Vendors</h3>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-4">
                Manage suppliers, track purchase orders, and monitor vendor performance.
              </p>
              <Link
                href="/workforce/suppliers"
                className="inline-block w-full text-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                View Supplier Directory
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
