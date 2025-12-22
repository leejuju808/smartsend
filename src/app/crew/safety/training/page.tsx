'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Shield, 
  Play, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  FileText,
  Video,
  ArrowLeft
} from 'lucide-react'

type TrainingAssignment = {
  id: string
  module_id: string
  employee_id: string
  assigned_at: string
  completed_at: string | null
  expires_at: string
  status: 'assigned' | 'in_progress' | 'completed' | 'expired' | 'reassigned'
  module: {
    id: string
    title: string
    description: string | null
    content_url: string
    module_type: string
    estimated_duration_minutes: number | null
  }
}

export default function CrewTrainingPage() {
  const router = useRouter()
  const [assignments, setAssignments] = useState<TrainingAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAssignment, setSelectedAssignment] = useState<TrainingAssignment | null>(null)

  useEffect(() => {
    loadAssignments()
  }, [])

  const loadAssignments = async () => {
    try {
      // Get current employee ID from session or context
      // For now, we'll fetch all assignments for the current user
      const res = await fetch('/api/safety/training/assignments')
      const data = await res.json()
      if (data.assignments) {
        setAssignments(data.assignments)
      }
    } catch (error) {
      console.error('Error loading assignments:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string, expiresAt: string) => {
    if (status === 'completed') {
      const expires = new Date(expiresAt)
      const daysUntilExpiry = Math.ceil((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      if (daysUntilExpiry < 0) return 'bg-red-100 text-red-800'
      if (daysUntilExpiry < 30) return 'bg-yellow-100 text-yellow-800'
      return 'bg-green-100 text-green-800'
    }
    if (status === 'expired') return 'bg-red-100 text-red-800'
    if (status === 'in_progress') return 'bg-blue-100 text-blue-800'
    return 'bg-gray-100 text-gray-800'
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      assigned: 'Assigned',
      in_progress: 'In Progress',
      completed: 'Completed',
      expired: 'Expired',
      reassigned: 'Reassigned'
    }
    return labels[status] || status
  }

  const getDaysUntilExpiry = (expiresAt: string) => {
    const expires = new Date(expiresAt)
    const days = Math.ceil((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return days
  }

  const handleStartTraining = async (assignment: TrainingAssignment) => {
    // Update status to in_progress
    try {
      const res = await fetch(`/api/safety/training/assignments/${assignment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      })

      if (res.ok) {
        setSelectedAssignment(assignment)
        loadAssignments()
      }
    } catch (error) {
      console.error('Error starting training:', error)
    }
  }

  const handleCompleteTraining = async (assignment: TrainingAssignment) => {
    // Navigate to sign-off page
    router.push(`/crew/safety/training/${assignment.id}/signoff`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="text-center text-gray-500">Loading training assignments...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <button
            onClick={() => router.back()}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Safety Training</h1>
          <p className="text-sm text-gray-500 mt-1">
            Complete required training modules to stay compliant
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Required Modules */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Required Training</h2>
          <div className="space-y-3">
            {assignments
              .filter((a) => a.status !== 'completed' || getDaysUntilExpiry(a.expires_at) < 30)
              .map((assignment) => (
                <div
                  key={assignment.id}
                  className="bg-white border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="h-5 w-5 text-blue-600" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          {assignment.module.title}
                        </h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(assignment.status, assignment.expires_at)}`}>
                          {getStatusLabel(assignment.status)}
                        </span>
                      </div>
                      {assignment.module.description && (
                        <p className="text-sm text-gray-600 mb-3">{assignment.module.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        {assignment.module.estimated_duration_minutes && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {assignment.module.estimated_duration_minutes} min
                          </div>
                        )}
                        {assignment.status === 'completed' && assignment.expires_at && (
                          <div className="flex items-center gap-1">
                            <AlertCircle className="h-4 w-4" />
                            Expires in {getDaysUntilExpiry(assignment.expires_at)} days
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ml-4">
                      {assignment.status === 'assigned' && (
                        <button
                          onClick={() => handleStartTraining(assignment)}
                          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Start Training
                        </button>
                      )}
                      {assignment.status === 'in_progress' && (
                        <div className="flex gap-2">
                          <a
                            href={assignment.module.content_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                          >
                            <Video className="h-4 w-4 mr-2" />
                            Continue
                          </a>
                          <button
                            onClick={() => handleCompleteTraining(assignment)}
                            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Complete
                          </button>
                        </div>
                      )}
                      {assignment.status === 'completed' && (
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="h-5 w-5 mr-2" />
                          <span className="text-sm font-medium">Completed</span>
                        </div>
                      )}
                      {assignment.status === 'expired' && (
                        <button
                          onClick={() => handleStartTraining(assignment)}
                          className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Retake
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Completed Modules */}
        {assignments.filter((a) => a.status === 'completed' && getDaysUntilExpiry(a.expires_at) >= 30).length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Completed Training</h2>
            <div className="space-y-3">
              {assignments
                .filter((a) => a.status === 'completed' && getDaysUntilExpiry(a.expires_at) >= 30)
                .map((assignment) => (
                  <div
                    key={assignment.id}
                    className="bg-white border border-gray-200 rounded-lg p-4 opacity-75"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">
                            {assignment.module.title}
                          </h3>
                          <p className="text-sm text-gray-500">
                            Completed on {new Date(assignment.completed_at || '').toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        Expires in {getDaysUntilExpiry(assignment.expires_at)} days
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {assignments.length === 0 && (
          <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
            <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No training assignments</h3>
            <p className="text-gray-500">You don't have any training assignments at this time</p>
          </div>
        )}
      </div>
    </div>
  )
}
























