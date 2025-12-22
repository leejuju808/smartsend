'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, FileText, AlertCircle, CheckCircle, XCircle, Star } from 'lucide-react'

type Subcontractor = {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  trade: string | null
  status: string
  avg_rating: number
  compliance_status: string
  jobs_completed: number
}

export default function SubcontractorsPage() {
  const router = useRouter()
  const [subs, setSubs] = useState<Subcontractor[]>([])
  const [loading, setLoading] = useState(true)
  const [tradeFilter, setTradeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [search, setSearch] = useState<string>('')
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    loadSubs()
  }, [tradeFilter, statusFilter, search])

  const loadSubs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (tradeFilter !== 'all') params.append('trade', tradeFilter)
      if (search) params.append('search', search)

      const res = await fetch(`/api/workforce/subs?${params.toString()}`)
      const data = await res.json()
      setSubs(data.subcontractors || [])
    } catch (error) {
      console.error('Error loading subcontractors:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddSub = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    
    try {
      const res = await fetch('/api/workforce/subs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          contact_name: formData.get('contact_name'),
          phone: formData.get('phone'),
          email: formData.get('email'),
          trade: formData.get('trade'),
          status: formData.get('status') || 'active',
        }),
      })

      if (res.ok) {
        setShowAddModal(false)
        loadSubs()
        e.currentTarget.reset()
      }
    } catch (error) {
      console.error('Error adding subcontractor:', error)
    }
  }

  const getRatingBadge = (rating: number) => {
    if (rating >= 4.5) {
      return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Top Sub</span>
    } else if (rating >= 3.0) {
      return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Good Sub</span>
    } else if (rating > 0) {
      return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Risk Sub</span>
    }
    return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">No Rating</span>
  }

  const getComplianceBadge = (status: string) => {
    if (status === 'compliant') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="mr-1 h-3 w-3" />
          Compliant
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <AlertCircle className="mr-1 h-3 w-3" />
        Incomplete
      </span>
    )
  }

  return (
    <div className="p-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Subcontractors</h1>
          <p className="text-sm text-gray-600 mt-1">Manage your tear-off crews, installers, and specialty subs</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Subcontractor
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <select
          value={tradeFilter}
          onChange={(e) => setTradeFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Trades</option>
          <option value="roofing">Roofing</option>
          <option value="gutters">Gutters</option>
          <option value="siding">Siding</option>
          <option value="framing">Framing</option>
          <option value="tear_off">Tear-Off</option>
          <option value="install">Install</option>
          <option value="other">Other</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="pending_docs">Pending Docs</option>
          <option value="banned">Banned</option>
        </select>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, contact, phone, email..."
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sub Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trade
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Compliance
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Jobs Completed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg Rating
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {subs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No subcontractors found. Add your first subcontractor to get started.
                  </td>
                </tr>
              ) : (
                subs.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{sub.name}</div>
                      {sub.contact_name && (
                        <div className="text-sm text-gray-500">{sub.contact_name}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900 capitalize">
                        {sub.trade?.replace('_', '-') || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{sub.phone || '—'}</div>
                      <div className="text-sm text-gray-500">{sub.email || '—'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getComplianceBadge(sub.compliance_status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {sub.jobs_completed}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {sub.avg_rating > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center">
                            <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                            <span className="ml-1 text-sm font-medium text-gray-900">
                              {sub.avg_rating.toFixed(1)}
                            </span>
                          </div>
                          {getRatingBadge(sub.avg_rating)}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">No rating</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/workforce/subs/${sub.id}`}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          View Profile
                        </Link>
                        <Link
                          href={`/workforce/subs/${sub.id}/compliance`}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          <FileText className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Add Subcontractor</h2>
            <form onSubmit={handleAddSub} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  name="contact_name"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  name="phone"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trade</label>
                <select
                  name="trade"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="roofing">Roofing</option>
                  <option value="gutters">Gutters</option>
                  <option value="siding">Siding</option>
                  <option value="framing">Framing</option>
                  <option value="tear_off">Tear-Off</option>
                  <option value="install">Install</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  name="status"
                  defaultValue="active"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="pending_docs">Pending Docs</option>
                  <option value="banned">Banned</option>
                </select>
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Subcontractor
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
























