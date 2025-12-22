'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'

type Employee = {
  id: string
  first_name: string
  last_name: string
  role: string | null
  phone: string | null
  email: string | null
  status: string | null
  skill_level: string | null
}

export default function EmployeesPage() {
  const router = useRouter()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [search, setSearch] = useState<string>('')
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    loadEmployees()
  }, [roleFilter, statusFilter, search])

  const loadEmployees = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (roleFilter !== 'all') params.append('role', roleFilter)
      if (search) params.append('search', search)

      const res = await fetch(`/api/workforce/employees?${params.toString()}`)
      const data = await res.json()
      setEmployees(data.employees || [])
    } catch (error) {
      console.error('Error loading employees:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddEmployee = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    
    try {
      const res = await fetch('/api/workforce/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: formData.get('first_name'),
          last_name: formData.get('last_name'),
          phone: formData.get('phone'),
          email: formData.get('email'),
          role: formData.get('role'),
          skill_level: formData.get('skill_level'),
          status: formData.get('status') || 'active',
        }),
      })

      if (res.ok) {
        setShowAddModal(false)
        loadEmployees()
        e.currentTarget.reset()
      }
    } catch (error) {
      console.error('Error adding employee:', error)
    }
  }

  const filteredEmployees = employees.filter((e) => {
    if (!search) return true
    const term = search.toLowerCase()
    return (
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(term) ||
      (e.phone || '').toLowerCase().includes(term) ||
      (e.email || '').toLowerCase().includes(term)
    )
  })

  return (
    <div className="p-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Employees</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Employee
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Roles</option>
          <option value="laborer">Laborer</option>
          <option value="installer">Installer</option>
          <option value="foreman">Foreman</option>
          <option value="project_manager">Project Manager</option>
          <option value="estimator">Estimator</option>
          <option value="sales">Sales</option>
          <option value="office">Office</option>
          <option value="other">Other</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="seasonal">Seasonal</option>
          <option value="on_leave">On Leave</option>
          <option value="terminated">Terminated</option>
        </select>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, email..."
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
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
                Phone
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
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                  No employees found.
                </td>
              </tr>
            ) : (
              filteredEmployees.map((employee) => (
                <tr
                  key={employee.id}
                  className="cursor-pointer hover:bg-gray-50"
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {employee.phone || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full capitalize ${
                        employee.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : employee.status === 'seasonal'
                          ? 'bg-yellow-100 text-yellow-800'
                          : employee.status === 'terminated'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {employee.status || 'active'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">—</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">—</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Add Employee</h2>
            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input
                    type="text"
                    name="first_name"
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    name="last_name"
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  name="phone"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  name="role"
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="laborer">Laborer</option>
                  <option value="installer">Installer</option>
                  <option value="foreman">Foreman</option>
                  <option value="project_manager">Project Manager</option>
                  <option value="estimator">Estimator</option>
                  <option value="sales">Sales</option>
                  <option value="office">Office</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Skill Level</label>
                <select
                  name="skill_level"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="apprentice">Apprentice</option>
                  <option value="mid">Mid</option>
                  <option value="senior">Senior</option>
                  <option value="expert">Expert</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  name="status"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  defaultValue="active"
                >
                  <option value="active">Active</option>
                  <option value="seasonal">Seasonal</option>
                  <option value="on_leave">On Leave</option>
                </select>
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
























