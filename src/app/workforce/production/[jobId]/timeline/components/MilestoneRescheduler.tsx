'use client'

// Office Rescheduler Component
// Allows PMs to reschedule milestones and automatically shifts dependent milestones

import { useState } from 'react'
import { Calendar, AlertCircle, ArrowRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'

type Milestone = {
  id: string
  name: string
  scheduled_date: string | null
  due_date: string | null
  depends_on: string | null
  status: string
}

type Props = {
  milestone: Milestone
  dependentMilestones: Milestone[]
  onRescheduled: () => void
}

export function MilestoneRescheduler({ milestone, dependentMilestones, onRescheduled }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [newScheduledDate, setNewScheduledDate] = useState(
    milestone.scheduled_date ? format(parseISO(milestone.scheduled_date), 'yyyy-MM-dd') : ''
  )
  const [newDueDate, setNewDueDate] = useState(
    milestone.due_date ? format(parseISO(milestone.due_date), 'yyyy-MM-dd') : ''
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  const handleReschedule = async () => {
    if (!newScheduledDate || !newDueDate) {
      setError('Both scheduled date and due date are required')
      return
    }

    if (new Date(newScheduledDate) > new Date(newDueDate)) {
      setError('Scheduled date must be before due date')
      return
    }

    setLoading(true)
    setError(null)
    setWarnings([])

    try {
      const res = await fetch('/api/workforce/milestones/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          milestone_id: milestone.id,
          new_scheduled_date: newScheduledDate,
          new_due_date: newDueDate,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        setError(errorData.error || 'Failed to reschedule milestone')
        return
      }

      const data = await res.json()

      // Check for warnings about shifted dependents
      if (data.shifted_dependents && data.shifted_dependents.length > 0) {
        const warningMessages = data.shifted_dependents.map((dep: Milestone) =>
          `"${dep.name}" has been automatically rescheduled`
        )
        setWarnings(warningMessages)
      }

      // Success - close modal and refresh
      setTimeout(() => {
        setIsOpen(false)
        onRescheduled()
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to reschedule milestone')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
      >
        <Calendar className="w-3 h-3" />
        Reschedule
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">Reschedule Milestone</h3>
        <p className="text-sm text-gray-600 mb-4">{milestone.name}</p>

        {dependentMilestones.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5" />
              <div className="text-xs text-blue-800">
                <div className="font-medium mb-1">Dependent milestones will be automatically shifted:</div>
                <ul className="list-disc list-inside space-y-1">
                  {dependentMilestones.map((dep) => (
                    <li key={dep.id}>{dep.name}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              New Scheduled Date
            </label>
            <input
              type="date"
              value={newScheduledDate}
              onChange={(e) => setNewScheduledDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              New Due Date
            </label>
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
            <div className="text-sm font-medium text-yellow-800 mb-2">Automatic Updates:</div>
            <ul className="text-xs text-yellow-700 space-y-1">
              {warnings.map((warning, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <ArrowRight className="w-3 h-3" />
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={() => setIsOpen(false)}
            className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleReschedule}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Rescheduling...' : 'Reschedule'}
          </button>
        </div>
      </div>
    </div>
  )
}
























