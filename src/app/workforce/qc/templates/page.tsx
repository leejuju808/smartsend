'use client'

import { useEffect, useState } from 'react'
import { Plus, Edit, Trash2, Copy } from 'lucide-react'
import { QCChecklistTemplate } from '@/types/database'

const JOB_TYPES = [
  'roof_replacement',
  'repair',
  'inspection',
  'gutter',
  'siding',
  'other'
]

const DEFAULT_CATEGORIES = [
  'Roof Surface',
  'Flashings',
  'Gutters',
  'Vents',
  'Cleanup',
  'Safety',
  'Materials',
  'Other'
]

export default function QCTemplatesPage() {
  const [templates, setTemplates] = useState<QCChecklistTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<QCChecklistTemplate | null>(null)
  const [jobTypeFilter, setJobTypeFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  useEffect(() => {
    loadTemplates()
  }, [jobTypeFilter])

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (jobTypeFilter !== 'all') {
        params.append('job_type', jobTypeFilter)
      }

      const res = await fetch(`/api/workforce/qc/templates?${params.toString()}`)
      const data = await res.json()
      setTemplates(data.templates || [])
    } catch (error) {
      console.error('Error loading templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTemplate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const templateData = {
      job_type: formData.get('job_type'),
      category: formData.get('category'),
      item: formData.get('item'),
      requires_photo: formData.get('requires_photo') === 'on',
      display_order: parseInt(formData.get('display_order') as string) || 0,
    }

    try {
      if (editingTemplate) {
        // Update existing
        const res = await fetch(`/api/workforce/qc/templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(templateData),
        })

        if (res.ok) {
          setEditingTemplate(null)
          setShowAddModal(false)
          loadTemplates()
        }
      } else {
        // Create new
        const res = await fetch('/api/workforce/qc/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(templateData),
        })

        if (res.ok) {
          setShowAddModal(false)
          loadTemplates()
          e.currentTarget.reset()
        }
      }
    } catch (error) {
      console.error('Error saving template:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return

    try {
      const res = await fetch(`/api/workforce/qc/templates/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        loadTemplates()
      }
    } catch (error) {
      console.error('Error deleting template:', error)
    }
  }

  const handleDuplicate = async (template: QCChecklistTemplate) => {
    try {
      const res = await fetch('/api/workforce/qc/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_type: template.job_type,
          category: template.category,
          item: template.item,
          requires_photo: template.requires_photo,
          display_order: template.display_order,
        }),
      })

      if (res.ok) {
        loadTemplates()
      }
    } catch (error) {
      console.error('Error duplicating template:', error)
    }
  }

  // Group templates by job type and category
  const groupedTemplates = templates.reduce((acc, template) => {
    const key = `${template.job_type}::${template.category}`
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(template)
    return acc
  }, {} as Record<string, QCChecklistTemplate[]>)

  const filteredTemplates = Object.entries(groupedTemplates).filter(([key]) => {
    if (jobTypeFilter !== 'all') {
      const [jobType] = key.split('::')
      if (jobType !== jobTypeFilter) return false
    }
    if (categoryFilter !== 'all') {
      const [, category] = key.split('::')
      if (category !== categoryFilter) return false
    }
    return true
  })

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">QC Checklist Templates</h1>
          <p className="text-sm text-gray-600 mt-1">
            Create standardized QC checklists for each job type
          </p>
        </div>
        <button
          onClick={() => {
            setEditingTemplate(null)
            setShowAddModal(true)
          }}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Template
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={jobTypeFilter}
          onChange={(e) => setJobTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="all">All Job Types</option>
          {JOB_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
            </option>
          ))}
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="all">All Categories</option>
          {DEFAULT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Templates List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading templates...</div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No templates found. Create your first QC template to get started.
        </div>
      ) : (
        <div className="space-y-6">
          {filteredTemplates.map(([key, items]) => {
            const [jobType, category] = key.split('::')
            return (
              <div key={key} className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {category}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {jobType.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {items
                    .sort((a, b) => a.display_order - b.display_order)
                    .map((template) => (
                      <div
                        key={template.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">
                              {template.item}
                            </p>
                            {template.requires_photo && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                                Requires Photo
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDuplicate(template)}
                            className="p-1.5 text-gray-400 hover:text-gray-600"
                            title="Duplicate"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingTemplate(template)
                              setShowAddModal(true)
                            }}
                            className="p-1.5 text-gray-400 hover:text-blue-600"
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(template.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">
              {editingTemplate ? 'Edit Template' : 'Add Template'}
            </h2>

            <form onSubmit={handleSaveTemplate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Job Type
                </label>
                <select
                  name="job_type"
                  defaultValue={editingTemplate?.job_type || ''}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">Select job type</option>
                  {JOB_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  name="category"
                  defaultValue={editingTemplate?.category || ''}
                  required
                  list="categories"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="e.g., Roof Surface, Flashings"
                />
                <datalist id="categories">
                  {DEFAULT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Checklist Item
                </label>
                <input
                  type="text"
                  name="item"
                  defaultValue={editingTemplate?.item || ''}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="e.g., Ridge caps installed correctly"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Order
                </label>
                <input
                  type="number"
                  name="display_order"
                  defaultValue={editingTemplate?.display_order || 0}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="requires_photo"
                  defaultChecked={editingTemplate?.requires_photo || false}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label className="ml-2 text-sm text-gray-700">
                  Requires photo for verification
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  {editingTemplate ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false)
                    setEditingTemplate(null)
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
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
























