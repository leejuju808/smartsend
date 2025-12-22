'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, CheckCircle, XCircle, Clock } from 'lucide-react'

type Assignment = {
  id: string
  job_id: string
  sub_id: string
  role: string | null
  status: string
  assigned_at: string
  completed_at: string | null
  notes: string | null
  subcontractors: {
    id: string
    name: string
    contact_name: string | null
    phone: string | null
    email: string | null
    trade: string | null
    status: string
  }
}

type Subcontractor = {
  id: string
  name: string
  contact_name: string | null
  trade: string | null
  status: string
}

export default function JobSubsPage() {
  const router = useRouter()
  const params = useParams()
  const jobId = params.jobId as string

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [availableSubs, setAvailableSubs] = useState<Subcontractor[]>([])
  const [loading, setLoading] = useState(true)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    loadData()
  }, [jobId])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load assignments
      const assignmentsRes = await fetch(`/api/workforce/jobs/${jobId}/subs`)
      const assignmentsData = await assignmentsRes.json()
      setAssignments(assignmentsData.assignments || [])

      // Load available subs
      const subsRes = await fetch('/api/workforce/subs?status=active')
      const subsData = await subsRes.json()
      setAvailableSubs(subsData.subcontractors || [])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAssign = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAssigning(true)

    const formData = new FormData(e.currentTarget)
    const subId = formData.get('sub_id') as string
    const role = formData.get('role') as string
    const notes = formData.get('notes') as string

    try {
      const res = await fetch(`/api/workforce/jobs/${jobId}/subs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sub_id: subId,
          role: role || null,
          notes: notes || null,
        }),
      })

      if (res.ok) {
        setShowAssignModal(false)
        loadData()
        e.currentTarget.reset()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to assign subcontractor')
      }
    } catch (error) {
      console.error('Error assigning subcontractor:', error)
      alert('Failed to assign subcontractor')
    } finally {
      setAssigning(false)
    }
  }

  const handleUpdateStatus = async (assignmentId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/workforce/jobs/${jobId}/subs/${assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (res.ok) {
        loadData()
      }
    } catch (error) {
      console.error('Error updating status:', error)
    }
  }

  const handleRemove = async (assignmentId: string) => {
    if (!confirm('Are you sure you want to remove this subcontractor from the job?')) return

    try {
      const res = await fetch(`/api/workforce/jobs/${jobId}/subs/${assignmentId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        loadData()
      }
    } catch (error) {
      console.error('Error removing assignment:', error)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="mr-1 h-3 w-3" />
            Completed
          </span>
        )
      case 'in_progress':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Clock className="mr-1 h-3 w-3" />
            In Progress
          </span>
        )
      case 'assigned':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            Assigned
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="mr-1 h-3 w-3" />
            Cancelled
          </span>
        )
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/workforce/jobs/${jobId}`}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Job
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Subcontractor Assignments</h1>
          <p className="text-sm text-gray-600 mt-1">Manage subcontractors for this job</p>
        </div>
        <button
          onClick={() => setShowAssignModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Assign Subcontractor
        </button>
      </div>

      {/* Assignments List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Assigned Subcontractors</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {assignments.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              No subcontractors assigned yet. Assign your first subcontractor to get started.
            </div>
          ) : (
            assignments.map((assignment) => (
              <div key={assignment.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-medium text-gray-900">
                        {assignment.subcontractors.name}
                      </span>
                      {getStatusBadge(assignment.status)}
                      {assignment.role && (
                        <span className="text-sm text-gray-600">({assignment.role})</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      <div>
                        Contact: {assignment.subcontractors.contact_name || 'N/A'} |{' '}
                        {assignment.subcontractors.phone || 'N/A'}
                      </div>
                      <div className="mt-1">
                        Assigned: {new Date(assignment.assigned_at).toLocaleDateString()}
                        {assignment.completed_at && (
                          <span className="ml-4">
                            Completed: {new Date(assignment.completed_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {assignment.notes && (
                        <div className="mt-1 text-gray-600">{assignment.notes}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {assignment.status === 'assigned' && (
                      <button
                        onClick={() => handleUpdateStatus(assignment.id, 'in_progress')}
                        className="text-sm text-blue-600 hover:text-blue-900"
                      >
                        Mark In Progress
                      </button>
                    )}
                    {assignment.status === 'in_progress' && (
                      <button
                        onClick={() => handleUpdateStatus(assignment.id, 'completed')}
                        className="text-sm text-green-600 hover:text-green-900"
                      >
                        Mark Completed
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(assignment.id)}
                      className="text-sm text-red-600 hover:text-red-900"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Assign Subcontractor</h2>
            <form onSubmit={handleAssign} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subcontractor *
                </label>
                <select
                  name="sub_id"
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select subcontractor...</option>
                  {availableSubs.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name} {sub.trade ? `(${sub.trade})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <input
                  type="text"
                  name="role"
                  placeholder="e.g., tear-off, install, gutters"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  name="notes"
                  rows={3}
                  placeholder="Additional notes or instructions..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  disabled={assigning}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {assigning ? 'Assigning...' : 'Assign Subcontractor'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
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
























