'use client'

// Block 252100 — Production Timeline Engine — Gantt View
// This is the heartbeat of job production orchestration

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, parseISO } from 'date-fns'
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Circle, 
  ArrowRight, 
  Calendar,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react'
import { MilestoneRescheduler } from './components/MilestoneRescheduler'
import { HardEvidenceUploader } from '@/components/HardEvidenceUploader'

type Milestone = {
  id: string
  name: string
  description: string | null
  scheduled_date: string | null
  due_date: string | null
  completed_date: string | null
  started_date: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'delayed'
  depends_on: string | null
  order_index: number
  blocker_count: number
  depends_on_milestone: {
    id: string
    name: string
    status: string
  } | null
}

type Job = {
  id: string
  homeowner_name: string | null
  address: string | null
  estimated_value: number | null
}

type JobHealth = {
  health_score: number
  health_status: 'healthy' | 'warning' | 'critical'
  breakdown: {
    delayed_milestones: number
    open_blockers: number
    days_behind: number
  }
}

export default function ProductionTimelinePage() {
  const params = useParams()
  const router = useRouter()
  const jobId = params.jobId as string

  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [job, setJob] = useState<Job | null>(null)
  const [health, setHealth] = useState<JobHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMilestone, setSelectedMilestone] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'gantt' | 'list'>('gantt')
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 0 })
    const end = endOfWeek(addDays(start, 28), { weekStartsOn: 0 }) // 4 weeks
    return { start, end }
  })

  useEffect(() => {
    if (jobId) {
      loadData()
    }
  }, [jobId])

  const loadData = async () => {
    try {
      setLoading(true)

      // Load milestones
      const milestonesRes = await fetch(`/api/workforce/milestones?job_id=${jobId}`)
      const milestonesData = await milestonesRes.json()
      setMilestones(milestonesData.milestones || [])

      // Load job info
      const jobRes = await fetch(`/api/workforce/jobs/${jobId}`)
      if (jobRes.ok) {
        const jobData = await jobRes.json()
        setJob(jobData.job || null)
      }

      // Load health score
      const healthRes = await fetch(`/api/workforce/jobs/${jobId}/health`)
      if (healthRes.ok) {
        const healthData = await healthRes.json()
        setHealth(healthData)
      }
    } catch (error) {
      console.error('Error loading timeline data:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateMilestoneStatus = async (milestoneId: string, newStatus: string) => {
    try {
      const res = await fetch('/api/workforce/milestones/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: milestoneId, status: newStatus }),
      })

      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Failed to update milestone')
        return
      }

      // Reload data
      loadData()
    } catch (error) {
      console.error('Error updating milestone:', error)
      alert('Failed to update milestone')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500'
      case 'in_progress':
        return 'bg-blue-500'
      case 'delayed':
        return 'bg-red-500'
      default:
        return 'bg-gray-400'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4" />
      case 'in_progress':
        return <Clock className="w-4 h-4" />
      case 'delayed':
        return <AlertTriangle className="w-4 h-4" />
      default:
        return <Circle className="w-4 h-4" />
    }
  }

  const calculateBarPosition = (milestone: Milestone) => {
    if (!milestone.scheduled_date || !milestone.due_date) {
      return { left: 0, width: 0 }
    }

    const start = parseISO(milestone.scheduled_date)
    const end = parseISO(milestone.due_date)
    const rangeStart = dateRange.start
    const rangeEnd = dateRange.end

    // Calculate position as percentage
    const totalDays = (rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)
    const daysFromStart = (start.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)
    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)

    const left = Math.max(0, (daysFromStart / totalDays) * 100)
    const width = Math.min(100 - left, (duration / totalDays) * 100)

    return { left, width }
  }

  const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end })

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Loading timeline...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Production Timeline</h1>
          {job && (
            <p className="text-sm text-gray-600 mt-1">
              {job.homeowner_name || 'Job'} • {job.address || 'No address'}
            </p>
          )}
          <div className="mt-2 inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            This job came from SmartSend
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setViewMode(viewMode === 'gantt' ? 'list' : 'gantt')}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            {viewMode === 'gantt' ? 'List View' : 'Gantt View'}
          </button>
        </div>
      </div>

      {/* Health Score */}
      {health && (
        <div className={`p-4 rounded-lg border-2 ${
          health.health_status === 'healthy' ? 'border-green-500 bg-green-50' :
          health.health_status === 'warning' ? 'border-yellow-500 bg-yellow-50' :
          'border-red-500 bg-red-50'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {health.health_status === 'healthy' ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : health.health_status === 'warning' ? (
                <Minus className="w-5 h-5 text-yellow-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-600" />
              )}
              <div>
                <div className="text-sm font-medium">Job Health Score</div>
                <div className="text-xs text-gray-600">
                  {health.breakdown.delayed_milestones} delayed • {health.breakdown.open_blockers} blockers • {health.breakdown.days_behind} days behind
                </div>
              </div>
            </div>
            <div className="text-3xl font-bold">
              {health.health_score}
            </div>
          </div>
        </div>
      )}

      {/* BLOCK 271100 — Hard Evidence (before/after proof) */}
      <HardEvidenceUploader jobId={jobId} />

      {viewMode === 'gantt' ? (
        /* Gantt View */
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          {/* Date Header */}
          <div className="border-b bg-gray-50">
            <div className="flex">
              <div className="w-64 p-3 border-r font-medium text-sm">Milestone</div>
              <div className="flex-1 overflow-x-auto">
                <div className="flex" style={{ minWidth: `${days.length * 40}px` }}>
                  {days.map((day: Date, idx: number) => {
                    if (idx % 7 === 0 || idx === 0) {
                      return (
                        <div
                          key={day.toISOString()}
                          className="border-r p-2 text-xs font-medium text-center"
                          style={{ minWidth: '280px' }}
                        >
                          {format(day, 'MMM d')} - {format(addDays(day, 6), 'MMM d')}
                        </div>
                      )
                    }
                    return null
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Milestone Rows */}
          <div className="divide-y">
            {milestones.map((milestone, idx) => {
              const barPos = calculateBarPosition(milestone)
              const isBlocked = milestone.depends_on && 
                milestones.find(m => m.id === milestone.depends_on)?.status !== 'completed'

              return (
                <div
                  key={milestone.id}
                  className="flex items-center hover:bg-gray-50 transition-colors"
                  onClick={() => setSelectedMilestone(selectedMilestone === milestone.id ? null : milestone.id)}
                >
                  {/* Milestone Name */}
                  <div className="w-64 p-3 border-r">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(milestone.status)}
                      <span className="text-sm font-medium">{milestone.name}</span>
                      {milestone.blocker_count > 0 && (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                    {milestone.depends_on_milestone && (
                      <div className="text-xs text-gray-500 mt-1">
                        Depends on: {milestone.depends_on_milestone.name}
                      </div>
                    )}
                  </div>

                  {/* Gantt Bar */}
                  <div className="flex-1 relative h-16 overflow-x-auto">
                    <div className="relative h-full" style={{ minWidth: `${days.length * 40}px` }}>
                      {milestone.scheduled_date && milestone.due_date ? (
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 h-8 rounded ${getStatusColor(milestone.status)} ${
                            isBlocked ? 'opacity-50' : ''
                          }`}
                          style={{
                            left: `${barPos.left}%`,
                            width: `${barPos.width}%`,
                            minWidth: '40px',
                          }}
                          title={`${milestone.name}: ${format(parseISO(milestone.scheduled_date), 'MMM d')} - ${format(parseISO(milestone.due_date), 'MMM d')}`}
                        >
                          <div className="h-full flex items-center justify-center text-white text-xs px-2 truncate">
                            {milestone.name}
                          </div>
                        </div>
                      ) : (
                        <div className="absolute top-1/2 -translate-y-1/2 left-0 text-xs text-gray-400">
                          No dates set
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* List View */
        <div className="space-y-3">
          {milestones.map((milestone) => {
            const isBlocked = milestone.depends_on && 
              milestones.find(m => m.id === milestone.depends_on)?.status !== 'completed'

            return (
              <div
                key={milestone.id}
                className="bg-white rounded-lg border p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded ${getStatusColor(milestone.status)} text-white`}>
                        {getStatusIcon(milestone.status)}
                      </div>
                      <div>
                        <div className="font-medium">{milestone.name}</div>
                        {milestone.description && (
                          <div className="text-sm text-gray-600 mt-1">{milestone.description}</div>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          {milestone.scheduled_date && (
                            <span>Scheduled: {format(parseISO(milestone.scheduled_date), 'MMM d, yyyy')}</span>
                          )}
                          {milestone.due_date && (
                            <span>Due: {format(parseISO(milestone.due_date), 'MMM d, yyyy')}</span>
                          )}
                          {milestone.completed_date && (
                            <span className="text-green-600">
                              Completed: {format(parseISO(milestone.completed_date), 'MMM d, yyyy')}
                            </span>
                          )}
                        </div>
                        {milestone.depends_on_milestone && (
                          <div className="flex items-center gap-2 mt-2 text-xs">
                            <ArrowRight className="w-3 h-3" />
                            <span className="text-gray-600">
                              Depends on: <strong>{milestone.depends_on_milestone.name}</strong>
                              {' '}({milestone.depends_on_milestone.status})
                            </span>
                          </div>
                        )}
                        {milestone.blocker_count > 0 && (
                          <div className="flex items-center gap-2 mt-2 text-xs text-red-600">
                            <AlertCircle className="w-3 h-3" />
                            <span>{milestone.blocker_count} blocker(s)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {milestone.status === 'pending' && !isBlocked && (
                      <button
                        onClick={() => updateMilestoneStatus(milestone.id, 'in_progress')}
                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Start
                      </button>
                    )}
                    {milestone.status === 'in_progress' && (
                      <button
                        onClick={() => updateMilestoneStatus(milestone.id, 'completed')}
                        className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Complete
                      </button>
                    )}
                    {isBlocked && (
                      <span className="text-xs text-gray-500">Blocked</span>
                    )}
                    <MilestoneRescheduler
                      milestone={milestone}
                      dependentMilestones={milestones.filter(m => m.depends_on === milestone.id)}
                      onRescheduled={loadData}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
























