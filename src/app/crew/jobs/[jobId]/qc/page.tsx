'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Check, X, Camera, ChevronDown, ChevronUp, Save } from 'lucide-react'
import { QCInspection, QCInspectionItem, QCChecklistTemplate } from '@/types/database'

export default function QCWalkthroughPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = params.jobId as string

  const [inspection, setInspection] = useState<QCInspection | null>(null)
  const [templates, setTemplates] = useState<QCChecklistTemplate[]>([])
  const [items, setItems] = useState<QCInspectionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [foremanId, setForemanId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [jobId])

  const loadData = async () => {
    setLoading(true)
    try {
      // Get job type from job
      const jobRes = await fetch(`/api/workforce/jobs/${jobId}`)
      const jobData = await jobRes.json()
      const jobType = jobData.job?.job_type || 'roof_replacement'

      // Load templates for this job type
      const templatesRes = await fetch(`/api/workforce/qc/templates?job_type=${jobType}`)
      const templatesData = await templatesRes.json()
      setTemplates(templatesData.templates || [])

      // Get or create inspection
      const inspectionsRes = await fetch(`/api/workforce/qc/inspections?job_id=${jobId}`)
      const inspectionsData = await inspectionsRes.json()
      
      let existingInspection = inspectionsData.inspections?.[0]
      
      if (!existingInspection) {
        // Create new inspection
        const createRes = await fetch('/api/workforce/qc/inspections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId }),
        })
        const createData = await createRes.json()
        existingInspection = createData.inspection
      }

      setInspection(existingInspection)

      // Load inspection items
      if (existingInspection) {
        const itemsRes = await fetch(`/api/workforce/qc/inspections/${existingInspection.id}/items`)
        const itemsData = await itemsRes.json()
        setItems(itemsData.items || [])

        // Initialize items from templates if not already created
        if (itemsData.items.length === 0 && templatesData.templates.length > 0) {
          await initializeItemsFromTemplates(existingInspection.id, templatesData.templates)
        }
      }

      // Get current user's employee ID (foreman)
      // This would typically come from auth context
      // For now, we'll try to get it from a user profile or session
    } catch (error) {
      console.error('Error loading QC data:', error)
    } finally {
      setLoading(false)
    }
  }

  const initializeItemsFromTemplates = async (inspectionId: string, templates: QCChecklistTemplate[]) => {
    const newItems: QCInspectionItem[] = []
    
    for (const template of templates) {
      try {
        const res = await fetch(`/api/workforce/qc/inspections/${inspectionId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_id: template.id,
            category: template.category,
            item: template.item,
          }),
        })
        const data = await res.json()
        if (data.item) {
          newItems.push(data.item)
        }
      } catch (error) {
        console.error('Error creating item from template:', error)
      }
    }

    if (newItems.length > 0) {
      setItems(newItems)
    }
  }

  const handleItemUpdate = async (itemId: string, updates: Partial<QCInspectionItem>) => {
    if (!inspection) return

    setSaving(true)
    try {
      const res = await fetch(`/api/workforce/qc/inspections/${inspection.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          ...updates,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setItems((prev) =>
          prev.map((item) => (item.id === itemId ? data.item : item))
        )
      }
    } catch (error) {
      console.error('Error updating item:', error)
    } finally {
      setSaving(false)
    }
  }

  const handlePhotoUpload = async (itemId: string, file: File) => {
    if (!inspection) return

    // Upload to Supabase storage
    // This is a simplified version - you'd need to implement actual file upload
    const formData = new FormData()
    formData.append('file', file)
    formData.append('jobId', jobId)
    formData.append('itemId', itemId)

    try {
      // Upload endpoint would be implemented separately
      const uploadRes = await fetch('/api/workforce/qc/upload-photo', {
        method: 'POST',
        body: formData,
      })

      if (uploadRes.ok) {
        const { photo_url } = await uploadRes.json()
        await handleItemUpdate(itemId, { photo_url })
      }
    } catch (error) {
      console.error('Error uploading photo:', error)
    }
  }

  const handleComplete = async () => {
    if (!inspection) return

    setSaving(true)
    try {
      const res = await fetch(`/api/workforce/qc/inspections/${inspection.id}?action=complete`, {
        method: 'POST',
      })

      if (res.ok) {
        router.push(`/crew/jobs/${jobId}`)
      }
    } catch (error) {
      console.error('Error completing inspection:', error)
    } finally {
      setSaving(false)
    }
  }

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  // Group items by category
  const groupedItems = items.reduce((acc, item) => {
    const category = item.category || 'Other'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(item)
    return acc
  }, {} as Record<string, QCInspectionItem[]>)

  const passedCount = items.filter((i) => i.passed === true).length
  const failedCount = items.filter((i) => i.passed === false).length
  const totalCount = items.length
  const completedCount = items.filter((i) => i.passed !== null).length

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-500">Loading QC checklist...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl font-semibold text-gray-900">QC Walkthrough</h1>
            <button
              onClick={() => router.back()}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Back
            </button>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-gray-600">
              {completedCount} / {totalCount} completed
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-600 font-medium">{passedCount} passed</span>
              <span className="text-red-600 font-medium">{failedCount} failed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Checklist Categories */}
      <div className="px-4 py-4 space-y-3">
        {Object.entries(groupedItems).map(([category, categoryItems]) => {
          const isExpanded = expandedCategories.has(category)
          const categoryPassed = categoryItems.filter((i) => i.passed === true).length
          const categoryTotal = categoryItems.length
          const categoryCompleted = categoryItems.filter((i) => i.passed !== null).length

          return (
            <div key={category} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50"
              >
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{category}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {categoryCompleted} / {categoryTotal} checked
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-gray-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                )}
              </button>

              {/* Category Items */}
              {isExpanded && (
                <div className="border-t border-gray-200 divide-y divide-gray-200">
                  {categoryItems.map((item) => (
                    <div key={item.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 mb-2">
                            {item.item}
                          </p>

                          {/* Pass/Fail Buttons */}
                          <div className="flex items-center gap-2 mb-2">
                            <button
                              onClick={() => handleItemUpdate(item.id, { passed: true })}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                item.passed === true
                                  ? 'bg-green-100 text-green-700 border-2 border-green-500'
                                  : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-green-50'
                              }`}
                            >
                              <Check className="h-4 w-4" />
                              Pass
                            </button>
                            <button
                              onClick={() => handleItemUpdate(item.id, { passed: false })}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                item.passed === false
                                  ? 'bg-red-100 text-red-700 border-2 border-red-500'
                                  : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-red-50'
                              }`}
                            >
                              <X className="h-4 w-4" />
                              Fail
                            </button>
                          </div>

                          {/* Photo Upload */}
                          {templates.find((t) => t.id === item.template_id)?.requires_photo && (
                            <div className="mt-2">
                              {item.photo_url ? (
                                <div className="flex items-center gap-2">
                                  <img
                                    src={item.photo_url}
                                    alt="QC photo"
                                    className="h-20 w-20 object-cover rounded-lg border border-gray-200"
                                  />
                                  <button
                                    onClick={() => {
                                      const input = document.createElement('input')
                                      input.type = 'file'
                                      input.accept = 'image/*'
                                      input.onchange = (e) => {
                                        const file = (e.target as HTMLInputElement).files?.[0]
                                        if (file) handlePhotoUpload(item.id, file)
                                      }
                                      input.click()
                                    }}
                                    className="text-sm text-blue-600 hover:text-blue-700"
                                  >
                                    Change Photo
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    const input = document.createElement('input')
                                    input.type = 'file'
                                    input.accept = 'image/*'
                                    input.onchange = (e) => {
                                      const file = (e.target as HTMLInputElement).files?.[0]
                                      if (file) handlePhotoUpload(item.id, file)
                                    }
                                    input.click()
                                  }}
                                  className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <Camera className="h-4 w-4" />
                                  Add Photo
                                </button>
                              )}
                            </div>
                          )}

                          {/* Notes */}
                          <textarea
                            placeholder="Add notes (optional)"
                            value={item.notes || ''}
                            onChange={(e) => {
                              setItems((prev) =>
                                prev.map((i) =>
                                  i.id === item.id ? { ...i, notes: e.target.value } : i
                                )
                              )
                            }}
                            onBlur={() => {
                              if (item.notes !== undefined) {
                                handleItemUpdate(item.id, { notes: item.notes })
                              }
                            }}
                            className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                            rows={2}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Fixed Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 shadow-lg">
        <div className="max-w-md mx-auto">
          <button
            onClick={handleComplete}
            disabled={saving || completedCount < totalCount}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>Saving...</>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Complete Inspection
              </>
            )}
          </button>
          {completedCount < totalCount && (
            <p className="text-xs text-gray-500 text-center mt-2">
              Complete all items before finishing
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
























