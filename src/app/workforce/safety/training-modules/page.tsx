'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  Shield, 
  Plus, 
  Video, 
  FileText, 
  Clock, 
  Users, 
  Edit, 
  Trash2,
  CheckCircle,
  AlertCircle,
  XCircle
} from 'lucide-react'

type TrainingModule = {
  id: string
  title: string
  description: string | null
  content_url: string
  module_type: string
  required_for_roles: string[]
  expires_after_days: number
  estimated_duration_minutes: number | null
  created_at: string
}

export default function TrainingModulesPage() {
  const router = useRouter()
  const [modules, setModules] = useState<TrainingModule[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingModule, setEditingModule] = useState<TrainingModule | null>(null)

  useEffect(() => {
    loadModules()
  }, [])

  const loadModules = async () => {
    try {
      const res = await fetch('/api/safety/training/modules')
      const data = await res.json()
      if (data.modules) {
        setModules(data.modules)
      }
    } catch (error) {
      console.error('Error loading modules:', error)
    } finally {
      setLoading(false)
    }
  }

  const getModuleTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      fall_protection: 'Fall Protection',
      ladder_safety: 'Ladder Safety',
      ppe: 'PPE Use',
      heat_illness_prevention: 'Heat Illness Prevention',
      electrical_awareness: 'Electrical Awareness',
      osha_jobsite_hazard: 'OSHA Jobsite Hazard',
      hazard_recognition: 'Hazard Recognition',
      daily_safety_briefing: 'Daily Safety Briefing',
      other: 'Other'
    }
    return labels[type] || type
  }

  const getModuleTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      fall_protection: 'bg-red-100 text-red-800',
      ladder_safety: 'bg-orange-100 text-orange-800',
      ppe: 'bg-blue-100 text-blue-800',
      heat_illness_prevention: 'bg-yellow-100 text-yellow-800',
      electrical_awareness: 'bg-purple-100 text-purple-800',
      osha_jobsite_hazard: 'bg-green-100 text-green-800',
      hazard_recognition: 'bg-indigo-100 text-indigo-800',
      daily_safety_briefing: 'bg-pink-100 text-pink-800',
      other: 'bg-gray-100 text-gray-800'
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Loading training modules...</div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Training Module Library</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage safety training modules, videos, PDFs, and quizzes
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/workforce/safety"
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Back to Safety
          </Link>
          <button
            onClick={() => {
              setEditingModule(null)
              setShowCreateModal(true)
            }}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Module
          </button>
        </div>
      </div>

      {/* Default Modules Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 mr-3" />
          <div>
            <h3 className="font-medium text-blue-900">Default Modules Included</h3>
            <p className="text-sm text-blue-700 mt-1">
              The following modules are automatically created for all companies:
              Fall Protection Basics, Ladder Safety 101, PPE Use, Heat Illness Prevention, 
              Electrical Awareness, OSHA Jobsite Hazard Training, Hazard Recognition (Foremen), 
              Daily Safety Briefing Training (Foremen)
            </p>
          </div>
        </div>
      </div>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((module) => (
          <div
            key={module.id}
            className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{module.title}</h3>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getModuleTypeColor(module.module_type)}`}>
                  {getModuleTypeLabel(module.module_type)}
                </span>
              </div>
            </div>

            {module.description && (
              <p className="text-sm text-gray-600 mb-4 line-clamp-2">{module.description}</p>
            )}

            <div className="space-y-2 mb-4">
              <div className="flex items-center text-sm text-gray-500">
                <Clock className="h-4 w-4 mr-2" />
                {module.estimated_duration_minutes ? `${module.estimated_duration_minutes} min` : 'Duration not set'}
              </div>
              <div className="flex items-center text-sm text-gray-500">
                <Users className="h-4 w-4 mr-2" />
                {module.required_for_roles.length === 0 
                  ? 'Required for all roles'
                  : `Required for: ${module.required_for_roles.join(', ')}`
                }
              </div>
              <div className="flex items-center text-sm text-gray-500">
                <Clock className="h-4 w-4 mr-2" />
                Expires after {module.expires_after_days} days
              </div>
            </div>

            <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
              <a
                href={module.content_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <Video className="h-4 w-4 mr-2" />
                View Content
              </a>
              <button
                onClick={() => {
                  setEditingModule(module)
                  setShowCreateModal(true)
                }}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <Edit className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {modules.length === 0 && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No training modules yet</h3>
          <p className="text-gray-500 mb-4">Create your first training module to get started</p>
          <button
            onClick={() => {
              setEditingModule(null)
              setShowCreateModal(true)
            }}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Module
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <CreateModuleModal
          module={editingModule}
          onClose={() => {
            setShowCreateModal(false)
            setEditingModule(null)
          }}
          onSuccess={() => {
            loadModules()
            setShowCreateModal(false)
            setEditingModule(null)
          }}
        />
      )}
    </div>
  )
}

function CreateModuleModal({
  module,
  onClose,
  onSuccess,
}: {
  module: TrainingModule | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [formData, setFormData] = useState({
    title: module?.title || '',
    description: module?.description || '',
    content_url: module?.content_url || '',
    module_type: module?.module_type || 'fall_protection',
    required_for_roles: module?.required_for_roles || [],
    expires_after_days: module?.expires_after_days || 365,
    estimated_duration_minutes: module?.estimated_duration_minutes || null,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const url = module 
        ? `/api/safety/training/modules/${module.id}`
        : '/api/safety/training/modules'
      
      const method = module ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save module')
      }

      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const moduleTypes = [
    { value: 'fall_protection', label: 'Fall Protection' },
    { value: 'ladder_safety', label: 'Ladder Safety' },
    { value: 'ppe', label: 'PPE Use' },
    { value: 'heat_illness_prevention', label: 'Heat Illness Prevention' },
    { value: 'electrical_awareness', label: 'Electrical Awareness' },
    { value: 'osha_jobsite_hazard', label: 'OSHA Jobsite Hazard' },
    { value: 'hazard_recognition', label: 'Hazard Recognition' },
    { value: 'daily_safety_briefing', label: 'Daily Safety Briefing' },
    { value: 'other', label: 'Other' },
  ]

  const roles = ['laborer', 'installer', 'foreman', 'project_manager', 'estimator', 'sales', 'office', 'other']

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {module ? 'Edit Training Module' : 'Create Training Module'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Content URL (Video/PDF) *
            </label>
            <input
              type="url"
              required
              value={formData.content_url}
              onChange={(e) => setFormData({ ...formData, content_url: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="https://example.com/training/video"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Module Type *
            </label>
            <select
              required
              value={formData.module_type}
              onChange={(e) => setFormData({ ...formData, module_type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {moduleTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Required For Roles (leave empty for all roles)
            </label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {roles.map((role) => (
                <label key={role} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.required_for_roles.includes(role)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({
                          ...formData,
                          required_for_roles: [...formData.required_for_roles, role],
                        })
                      } else {
                        setFormData({
                          ...formData,
                          required_for_roles: formData.required_for_roles.filter((r) => r !== role),
                        })
                      }
                    }}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700 capitalize">{role}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expires After (days)
              </label>
              <input
                type="number"
                min="1"
                value={formData.expires_after_days}
                onChange={(e) => setFormData({ ...formData, expires_after_days: parseInt(e.target.value) || 365 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration (minutes)
              </label>
              <input
                type="number"
                min="1"
                value={formData.estimated_duration_minutes || ''}
                onChange={(e) => setFormData({ ...formData, estimated_duration_minutes: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : module ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
























