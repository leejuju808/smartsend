'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, X, Calendar, DollarSign, Camera, AlertCircle } from 'lucide-react'

type Job = {
  id: string
  title: string
  address: string
  homeowner_name: string
}

type Subcontractor = {
  id: string
  name: string
  trade: string
}

type Task = {
  task: string
  quantity: number
  rate: number
  rate_type: string
}

type PhotoRequirements = {
  before: number
  during: number
  after: number
  flashing_detail: boolean
  ridge_cap_detail: boolean
}

interface WorkOrderBuilderProps {
  onClose: () => void
  onSuccess?: () => void
  defaultJobId?: string
  defaultSubId?: string
}

export function WorkOrderBuilder({ onClose, onSuccess, defaultJobId, defaultSubId }: WorkOrderBuilderProps) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [subs, setSubs] = useState<Subcontractor[]>([])
  const [rates, setRates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [selectedJobId, setSelectedJobId] = useState<string>(defaultJobId || '')
  const [selectedSubId, setSelectedSubId] = useState<string>(defaultSubId || '')
  const [description, setDescription] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [photoRequirements, setPhotoRequirements] = useState<PhotoRequirements>({
    before: 4,
    during: 6,
    after: 4,
    flashing_detail: true,
    ridge_cap_detail: true,
  })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedSubId) {
      loadRates(selectedSubId)
    }
  }, [selectedSubId])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load jobs
      const jobsRes = await fetch('/api/pipeline/jobs')
      const jobsData = await jobsRes.json()
      setJobs(jobsData.jobs || [])

      // Load subcontractors
      const subsRes = await fetch('/api/workforce/subs?status=active')
      const subsData = await subsRes.json()
      setSubs(subsData.subcontractors || [])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadRates = async (subId: string) => {
    try {
      const res = await fetch(`/api/workforce/subcontractors/rates?subcontractor_id=${subId}`)
      const data = await res.json()
      setRates(data.rates || [])
    } catch (error) {
      console.error('Error loading rates:', error)
    }
  }

  const addTask = () => {
    setTasks([...tasks, { task: '', quantity: 0, rate: 0, rate_type: 'per_square' }])
  }

  const removeTask = (index: number) => {
    setTasks(tasks.filter((_, i) => i !== index))
  }

  const updateTask = (index: number, field: keyof Task, value: any) => {
    const newTasks = [...tasks]
    newTasks[index] = { ...newTasks[index], [field]: value }
    setTasks(newTasks)
  }

  const calculateEstimatedCost = () => {
    return tasks.reduce((sum, task) => {
      return sum + (task.quantity || 0) * (task.rate || 0)
    }, 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const res = await fetch('/api/workforce/subcontractors/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: selectedJobId,
          subcontractor_id: selectedSubId,
          description,
          scheduled_date: scheduledDate,
          tasks,
          photo_requirements: photoRequirements,
        }),
      })

      if (res.ok) {
        if (onSuccess) onSuccess()
        onClose()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to create work order')
      }
    } catch (error) {
      console.error('Error creating work order:', error)
      alert('Failed to create work order')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedSub = subs.find(s => s.id === selectedSubId)
  const estimatedCost = calculateEstimatedCost()

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <div className="text-gray-600">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 my-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Create Work Order</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Job Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Job *
            </label>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a job</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title || job.address} - {job.homeowner_name}
                </option>
              ))}
            </select>
          </div>

          {/* Subcontractor Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subcontractor *
            </label>
            <select
              value={selectedSubId}
              onChange={(e) => setSelectedSubId(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a subcontractor</option>
              {subs.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name} ({sub.trade})
                </option>
              ))}
            </select>
            {selectedSub && (
              <div className="mt-2 text-sm text-gray-600">
                <Link
                  href={`/workforce/subcontractors/rates?sub=${selectedSubId}`}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Manage rates for {selectedSub.name}
                </Link>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe the work to be performed..."
            />
          </div>

          {/* Scheduled Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="inline h-4 w-4 mr-1" />
              Scheduled Date
            </label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Tasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Tasks *
              </label>
              <button
                type="button"
                onClick={addTask}
                className="inline-flex items-center px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Task
              </button>
            </div>

            {tasks.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-4 border border-dashed border-gray-300 rounded-md">
                No tasks added. Click "Add Task" to get started.
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task, index) => (
                  <div key={index} className="flex gap-2 items-start p-3 border border-gray-200 rounded-md">
                    <div className="flex-1 grid grid-cols-4 gap-2">
                      <input
                        type="text"
                        value={task.task}
                        onChange={(e) => updateTask(index, 'task', e.target.value)}
                        placeholder="Task (e.g., install, tear-off)"
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="number"
                        value={task.quantity || ''}
                        onChange={(e) => updateTask(index, 'quantity', parseFloat(e.target.value) || 0)}
                        placeholder="Quantity"
                        min="0"
                        step="0.01"
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <select
                        value={task.rate_type}
                        onChange={(e) => updateTask(index, 'rate_type', e.target.value)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="per_square">Per Square</option>
                        <option value="per_lf">Per LF</option>
                        <option value="per_hour">Per Hour</option>
                        <option value="per_job">Per Job</option>
                        <option value="per_task">Per Task</option>
                      </select>
                      <input
                        type="number"
                        value={task.rate || ''}
                        onChange={(e) => updateTask(index, 'rate', parseFloat(e.target.value) || 0)}
                        placeholder="Rate"
                        min="0"
                        step="0.01"
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeTask(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {estimatedCost > 0 && (
                  <div className="mt-2 p-3 bg-blue-50 rounded-md">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">Estimated Cost:</span>
                      <span className="font-bold text-blue-600">${estimatedCost.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Photo Requirements */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Camera className="inline h-4 w-4 mr-1" />
              Photo Requirements
            </label>
            <div className="grid grid-cols-2 gap-4 p-4 border border-gray-200 rounded-md">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Before Photos</label>
                <input
                  type="number"
                  value={photoRequirements.before}
                  onChange={(e) => setPhotoRequirements({ ...photoRequirements, before: parseInt(e.target.value) || 0 })}
                  min="0"
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">During Photos</label>
                <input
                  type="number"
                  value={photoRequirements.during}
                  onChange={(e) => setPhotoRequirements({ ...photoRequirements, during: parseInt(e.target.value) || 0 })}
                  min="0"
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">After Photos</label>
                <input
                  type="number"
                  value={photoRequirements.after}
                  onChange={(e) => setPhotoRequirements({ ...photoRequirements, after: parseInt(e.target.value) || 0 })}
                  min="0"
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={photoRequirements.flashing_detail}
                    onChange={(e) => setPhotoRequirements({ ...photoRequirements, flashing_detail: e.target.checked })}
                    className="mr-2"
                  />
                  Flashing Detail Required
                </label>
                <label className="flex items-center text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={photoRequirements.ridge_cap_detail}
                    onChange={(e) => setPhotoRequirements({ ...photoRequirements, ridge_cap_detail: e.target.checked })}
                    className="mr-2"
                  />
                  Ridge Cap Detail Required
                </label>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              <AlertCircle className="inline h-3 w-3 mr-1" />
              Subcontractor cannot be paid until all required photos are submitted and pass QC.
            </p>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              type="submit"
              disabled={submitting || tasks.length === 0}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating...' : 'Create Work Order'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
























